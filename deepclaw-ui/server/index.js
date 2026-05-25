/**
 * DeepClaw UI Proxy Server — port 18791
 *
 * - Serves built Next.js static files (../client/out/)
 * - WebSocket proxy: /ws/gateway → OpenClaw gateway at 18789 (auth handled server-side)
 * - REST API: sessions list, session history, file browser
 */

const fs        = require('fs');
const path      = require('path');
const http      = require('http');
const net       = require('net');
const { spawn } = require('child_process');
const os        = require('os');
const crypto    = require('crypto');
const express   = require('express');
const WebSocket = require('ws');
const cors      = require('cors');

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT           = parseInt(process.env.DEEPCLAW_UI_PORT || '19000', 10);
const NEXT_PORT      = parseInt(process.env.DEEPCLAW_NEXT_PORT || String(PORT + 1), 10);
const CLIENT_DIR     = path.join(__dirname, '..', 'client');
const OPENCLAW_HOME  = path.join(os.homedir(), '.openclaw');

function readGatewayConfig() {
  try {
    let raw = fs.readFileSync(path.join(OPENCLAW_HOME, 'openclaw.json'), 'utf-8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    const cfg = JSON.parse(raw);
    return {
      port:  cfg?.gateway?.port  || 18789,
      token: cfg?.gateway?.auth?.token || '',
    };
  } catch (err) {
    console.warn('⚠️  Could not read openclaw.json:', err.message);
    return { port: 18789, token: '' };
  }
}

function readDeviceIdentity() {
  try {
    const deviceFile = path.join(OPENCLAW_HOME, 'identity', 'device.json');
    const authFile   = path.join(OPENCLAW_HOME, 'identity', 'device-auth.json');
    if (!fs.existsSync(deviceFile)) return null;
    const device = JSON.parse(fs.readFileSync(deviceFile, 'utf-8'));
    // Extract raw 32-byte public key from PKCS#8 SPKI PEM → base64url
    const pubKeyObj = crypto.createPublicKey(device.publicKeyPem);
    const pubDer    = pubKeyObj.export({ type: 'spki', format: 'der' });
    const publicKey = pubDer.slice(-32).toString('base64url');
    let operatorToken = null;
    if (fs.existsSync(authFile)) {
      const auth = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
      operatorToken = auth?.tokens?.operator?.token || null;
    }
    return {
      deviceId:      device.deviceId,
      publicKey,               // base64url raw 32-byte public key
      privateKeyPem: device.privateKeyPem,
      operatorToken,
    };
  } catch (err) {
    console.warn('⚠️  Could not read device identity:', err.message);
    return null;
  }
}

// Build the canonical sign string per the OpenClaw protocol (v2 format)
function buildSignString({ deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce }) {
  const scopesStr = Array.isArray(scopes) ? scopes.join(',') : '';
  const tokenStr  = token ?? '';
  return ['v2', deviceId, clientId, clientMode, role, scopesStr, String(signedAtMs), tokenStr, nonce].join('|');
}

// Sign the string with Ed25519 private key PEM, return base64url signature
function signEd25519(pem, message) {
  const privateKey = crypto.createPrivateKey(pem);
  const sig = crypto.sign(null, Buffer.from(message, 'utf-8'), privateKey);
  return sig.toString('base64url');
}

const gw     = readGatewayConfig();
const device = readDeviceIdentity();

const GATEWAY_WS_URL = `ws://127.0.0.1:${gw.port}`;
const GATEWAY_TOKEN  = gw.token;

const DEVICE_SCOPES = ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals', 'operator.pairing'];

if (device) {
  console.log(`🔑 Device identity loaded: ${device.deviceId.slice(0, 16)}...`);
} else {
  console.warn('⚠️  No device identity found — falling back to token-only auth (limited scopes)');
}

const SESSIONS_DIR   = path.join(OPENCLAW_HOME, 'agents', 'main', 'sessions');
const SESSIONS_META  = path.join(SESSIONS_DIR, 'sessions.json');

// Resolve workspace projects directory.
// Priority: env var → openclaw.json agents.list → directory scan → hardcoded fallback
function resolveWorkspaceRoot() {
  // 1. Explicit env override
  if (process.env.OPENCLAW_WORKSPACE) {
    return path.isAbsolute(process.env.OPENCLAW_WORKSPACE)
      ? process.env.OPENCLAW_WORKSPACE
      : path.join(OPENCLAW_HOME, process.env.OPENCLAW_WORKSPACE, 'state', 'projects');
  }
  // 2. Read from openclaw.json → agents.list (most reliable)
  try {
    let raw = fs.readFileSync(path.join(OPENCLAW_HOME, 'openclaw.json'), 'utf-8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    const cfg     = JSON.parse(raw);
    const agents  = cfg?.agents?.list || [];
    // Prefer scientist agent; fall back to first agent that has a workspace field
    const agent   = agents.find(a => a.id === 'scientist') || agents.find(a => a.workspace);
    if (agent?.workspace) return path.join(agent.workspace, 'state', 'projects');
  } catch {}
  // 3. Scan ~/.openclaw/ for workspace-*/state/projects/
  try {
    for (const entry of fs.readdirSync(OPENCLAW_HOME)) {
      if (!entry.startsWith('workspace')) continue;
      const candidate = path.join(OPENCLAW_HOME, entry, 'state', 'projects');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {}
  // 4. Hardcoded fallback
  return path.join(OPENCLAW_HOME, 'workspace-scientist', 'state', 'projects');
}

const WORKSPACE_ROOT = resolveWorkspaceRoot();

// ─── Gateway session creation (for POST /api/sessions/create) ─────────────────

function createSessionViaGateway() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(GATEWAY_WS_URL);
    let connectSent = false, done = false;

    const fail = (err) => { if (!done) { done = true; clearTimeout(timer); ws.close(); reject(err); } };
    const timer = setTimeout(() => fail(new Error('Timeout creating session')), 10000);

    function doConnect(nonce) {
      if (connectSent) return;
      connectSent = true;
      const scopes = device ? DEVICE_SCOPES : ['operator.read', 'operator.write'];
      const auth   = { token: GATEWAY_TOKEN };
      if (device?.operatorToken) auth.deviceToken = device.operatorToken;
      let deviceParam;
      if (device?.privateKeyPem) {
        const signedAtMs = Date.now();
        const signStr    = buildSignString({ deviceId: device.deviceId, clientId: 'cli', clientMode: 'cli', role: 'operator', scopes, signedAtMs, token: GATEWAY_TOKEN, nonce });
        deviceParam = { id: device.deviceId, publicKey: device.publicKey, signature: signEd25519(device.privateKeyPem, signStr), signedAt: signedAtMs, nonce };
      }
      ws.send(JSON.stringify({ type: 'req', id: 'c', method: 'connect', params: {
        minProtocol: 4, maxProtocol: 4, client: { id: 'cli', version: '1.0.0', platform: 'win32', mode: 'cli' },
        role: 'operator', scopes, caps: ['tool-events'], auth,
        ...(deviceParam ? { device: deviceParam } : {}),
      }}));
    }

    ws.on('open', () => { setTimeout(() => { if (!connectSent) doConnect(''); }, 500); });
    ws.on('message', (data) => {
      if (done) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'event' && msg.event === 'connect.challenge' && !connectSent) { doConnect(msg.payload?.nonce || ''); return; }
        if (msg.type === 'res' && msg.id === 'c' && msg.ok) {
          ws.send(JSON.stringify({ type: 'req', id: 's', method: 'sessions.create', params: { agentId: 'scientist' } }));
          return;
        }
        if (msg.type === 'res' && msg.id === 's') {
          done = true; clearTimeout(timer); ws.close();
          msg.ok ? resolve(msg.payload) : reject(new Error(msg.error?.message || 'Session creation failed'));
        }
      } catch {}
    });
    ws.on('error', fail);
    ws.on('close', () => { if (!done) fail(new Error('Connection closed')); });
  });
}


// ─── Express ──────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// ─── REST: sessions list ──────────────────────────────────────────────────────

app.get('/api/sessions', (req, res) => {
  try {
    // Merge sessions.json from all agent directories
    const agentsDir = path.join(OPENCLAW_HOME, 'agents');
    let meta = {};
    try {
      for (const ag of fs.readdirSync(agentsDir)) {
        const f = path.join(agentsDir, ag, 'sessions', 'sessions.json');
        if (fs.existsSync(f)) Object.assign(meta, JSON.parse(fs.readFileSync(f, 'utf-8')));
      }
    } catch {}
    // Fallback to legacy single path
    if (Object.keys(meta).length === 0 && fs.existsSync(SESSIONS_META))
      meta = JSON.parse(fs.readFileSync(SESSIONS_META, 'utf-8'));

    const agent = req.query.agent; // ?agent=scientist
    const list = Object.entries(meta)
      .filter(([key, s]) => {
        if (!s) return false;
        if (agent) {
          const a = agent.toLowerCase();
          return key.toLowerCase().includes(a)
            || String(s.agentId || '').toLowerCase() === a
            || String(s.origin?.agentId || '').toLowerCase() === a;
        }
        return true;
      })
      .map(([key, s]) => ({
        id:        s.sessionId || key,
        key,
        updatedAt: s.updatedAt,
        startedAt: s.sessionStartedAt,
        channel:   s.deliveryContext?.channel || s.origin?.provider || 'unknown',
        label:     s.origin?.label || s.sessionId?.slice(0, 8) || key.split(':').slice(-1)[0].slice(0, 12),
      }));
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REST: session history ────────────────────────────────────────────────────

app.get('/api/sessions/:id', (req, res) => {
  try {
    // Search across all agent session directories
    const agentsDir = path.join(OPENCLAW_HOME, 'agents');
    let file = null;
    try {
      for (const agent of fs.readdirSync(agentsDir)) {
        const candidate = path.join(agentsDir, agent, 'sessions', `${req.params.id}.jsonl`);
        if (fs.existsSync(candidate)) { file = candidate; break; }
      }
    } catch {}
    // Fallback to legacy path
    if (!file) {
      const legacy = path.join(SESSIONS_DIR, `${req.params.id}.jsonl`);
      if (fs.existsSync(legacy)) file = legacy;
    }
    // New session: file doesn't exist yet (no messages exchanged) — return empty history
    if (!file) return res.json({ sessionId: req.params.id, messages: [] });

    const messages = [];
    for (const line of fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)) {
      try {
        const r = JSON.parse(line);
        if (r.type === 'message') {
          messages.push({
            id:        r.id,
            parentId:  r.parentId,
            timestamp: r.timestamp,
            role:      r.message?.role,
            content:   r.message?.content || [],
          });
        }
      } catch { /* skip malformed lines */ }
    }

    res.json({ sessionId: req.params.id, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── REST: create new session ─────────────────────────────────────────────────

app.post('/api/sessions/create', async (req, res) => {
  try {
    const session = await createSessionViaGateway();
    res.json(session);
  } catch (err) {
    console.error('[sessions.create]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── REST: find project linked to a session ───────────────────────────────────

app.get('/api/sessions/:sessionId/linked-project', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!fs.existsSync(WORKSPACE_ROOT)) return res.json(null);
    const entries = await fs.promises.readdir(WORKSPACE_ROOT, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      try {
        const raw = (await fs.promises.readFile(path.join(WORKSPACE_ROOT, e.name, '.session'), 'utf-8')).trim();
        if (raw === sessionId || raw.includes(sessionId)) {
          return res.json({ slug: e.name });
        }
      } catch {}
    }
    res.json(null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── REST: file browser ───────────────────────────────────────────────────────

app.get('/api/workspace/files', async (req, res) => {
  try {
    const dirPath = path.resolve(WORKSPACE_ROOT, req.query.path || '');
    if (!dirPath.startsWith(WORKSPACE_ROOT)) return res.status(403).send('Forbidden');
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    res.json(items.map(i => ({ name: i.name, isDirectory: i.isDirectory() })));
  } catch (err) {
    res.status(err.code === 'ENOENT' ? 404 : 500).send(err.message);
  }
});

app.get('/api/workspace/file', async (req, res) => {
  try {
    if (!req.query.path) return res.status(400).send('Missing path');
    const filePath = path.resolve(WORKSPACE_ROOT, req.query.path);
    if (!filePath.startsWith(WORKSPACE_ROOT)) return res.status(403).send('Forbidden');

    let stat;
    try { stat = await fs.promises.stat(filePath); }
    catch { return res.status(404).send('File not found'); }
    if (!stat.isFile()) return res.status(400).send('Not a file');

    const ext = path.extname(filePath).toLowerCase();
    if (['.html', '.md', '.txt', '.json', '.csv'].includes(ext)) {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      res.type(ext === '.html' ? 'text/html' : 'text/plain').send(data);
      return;
    }

    const mime = {
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.pdf': 'application/pdf', '.png': 'image/png',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.zip': 'application/zip',
    }[ext] || 'application/octet-stream';

    const fileName    = path.basename(filePath);
    const encodedName = encodeURIComponent(fileName);
    const asciiName   = fileName.replace(/[^\x20-\x7E]/g, '_');
    res.writeHead(200, {
      'Content-Type':        mime,
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      'Content-Length':      stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ─── Helper: read project metadata ───────────────────────────────────────────

async function readProjectMeta(slug) {
  const projDir = path.join(WORKSPACE_ROOT, slug);
  const proj = { slug, title: slug.replace(/-/g, ' '), status: 'unknown',
                 createdAt: null, topic: '', tags: [], sessionKey: null, updatedAt: 0 };
  try {
    const md = await fs.promises.readFile(path.join(projDir, 'project.md'), 'utf-8');
    const m1 = md.match(/\*\*状态\*\*[:：]\s*(\S+)/);        if (m1) proj.status = m1[1];
    const m2 = md.match(/\*\*创建\*\*[:：]\s*(\S+)/);        if (m2) proj.createdAt = m2[1];
    const m3 = md.match(/##\s*研究主题\s*\n+\*\*(.+?)\*\*/); if (m3) proj.topic = m3[1];
    else {
      const m4 = md.match(/##\s*研究主题\s*\n+(.+)/);
      if (m4) proj.topic = m4[1].replace(/\*+/g, '').trim().slice(0, 100);
    }
    const m5 = md.match(/领域标签\*\*[:：]\s*\[(.+?)\]/);
    if (m5) proj.tags = m5[1].split(',').map(t => t.trim()).filter(Boolean);
  } catch {}
  try {
    const raw = await fs.promises.readFile(path.join(projDir, '.session'), 'utf-8');
    proj.sessionKey = raw.trim() || null;
  } catch {}
  try { proj.updatedAt = (await fs.promises.stat(projDir)).mtimeMs; } catch {}
  return proj;
}

// ─── REST: projects ───────────────────────────────────────────────────────────

app.get('/api/projects', async (req, res) => {
  try {
    if (!fs.existsSync(WORKSPACE_ROOT)) return res.json([]);
    const entries = await fs.promises.readdir(WORKSPACE_ROOT, { withFileTypes: true });
    const slugs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name);
    const projects = await Promise.all(slugs.map(readProjectMeta));
    projects.sort((a, b) => b.updatedAt - a.updatedAt);
    res.json(projects);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/projects/:slug', async (req, res) => {
  try {
    const dir = path.resolve(WORKSPACE_ROOT, req.params.slug);
    if (!dir.startsWith(WORKSPACE_ROOT)) return res.status(403).send('Forbidden');
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Not found' });
    res.json(await readProjectMeta(req.params.slug));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/projects', async (req, res) => {
  try {
    const { slug } = req.body;
    if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug))
      return res.status(400).json({ error: 'Invalid slug (lowercase, numbers, hyphens)' });
    const dir = path.join(WORKSPACE_ROOT, slug);
    if (fs.existsSync(dir)) return res.status(409).json({ error: 'Project already exists' });
    await fs.promises.mkdir(dir, { recursive: true });
    res.json({ ok: true, slug });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/projects/:slug/session', async (req, res) => {
  try {
    const dir = path.resolve(WORKSPACE_ROOT, req.params.slug);
    if (!dir.startsWith(WORKSPACE_ROOT)) return res.status(403).send('Forbidden');
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Not found' });
    const { sessionKey } = req.body;
    if (!sessionKey) return res.status(400).json({ error: 'sessionKey required' });
    await fs.promises.writeFile(path.join(dir, '.session'), sessionKey, 'utf-8');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── REST: project-scoped files ───────────────────────────────────────────────

app.get('/api/projects/:slug/files', async (req, res) => {
  try {
    const projRoot = path.resolve(WORKSPACE_ROOT, req.params.slug);
    if (!projRoot.startsWith(WORKSPACE_ROOT)) return res.status(403).send('Forbidden');
    const dirPath = path.resolve(projRoot, req.query.path || '');
    if (!dirPath.startsWith(projRoot)) return res.status(403).send('Forbidden');
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    res.json(items.filter(i => !i.name.startsWith('.')).map(i => ({ name: i.name, isDirectory: i.isDirectory() })));
  } catch (err) { res.status(err.code === 'ENOENT' ? 404 : 500).send(err.message); }
});

app.get('/api/projects/:slug/file', async (req, res) => {
  try {
    const projRoot = path.resolve(WORKSPACE_ROOT, req.params.slug);
    if (!projRoot.startsWith(WORKSPACE_ROOT)) return res.status(403).send('Forbidden');
    if (!req.query.path) return res.status(400).send('Missing path');
    const filePath = path.resolve(projRoot, req.query.path);
    if (!filePath.startsWith(projRoot)) return res.status(403).send('Forbidden');
    let stat;
    try { stat = await fs.promises.stat(filePath); } catch { return res.status(404).send('Not found'); }
    if (!stat.isFile()) return res.status(400).send('Not a file');
    const ext = path.extname(filePath).toLowerCase();
    if (['.html', '.md', '.txt', '.json', '.csv'].includes(ext)) {
      res.type(ext === '.html' ? 'text/html' : 'text/plain')
         .send(await fs.promises.readFile(filePath, 'utf-8'));
      return;
    }
    const mime = { '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg', '.zip': 'application/zip' }[ext] || 'application/octet-stream';
    const fn = path.basename(filePath);
    res.writeHead(200, { 'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${fn.replace(/[^\x20-\x7E]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(fn)}`,
      'Content-Length': stat.size });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) { res.status(500).send(err.message); }
});

// ─── HTTP proxy → Next.js ─────────────────────────────────────────────────────

function proxyToNext(req, res) {
  const proxyReq = http.request({
    hostname: '127.0.0.1',
    port:     NEXT_PORT,
    path:     req.url,
    method:   req.method,
    headers:  { ...req.headers, host: `127.0.0.1:${NEXT_PORT}` },
  }, proxyRes => {
    if (!res.headersSent)
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.type('html').status(502).send(
        '<html><head><meta charset="utf-8"><style>' +
        'body{font-family:monospace;display:flex;align-items:center;justify-content:center;' +
        'height:100vh;margin:0;background:#0a0a0a;color:#ccff00;text-align:center}' +
        'p{color:#555}</style></head><body>' +
        '<div><div style="font-size:32px;margin-bottom:12px">◈</div>' +
        '<h2 style="margin:0 0 8px;letter-spacing:.1em">STARTING UP</h2>' +
        '<p>Next.js is initializing — refreshing in 3s…</p>' +
        '<script>setTimeout(()=>location.reload(),3000)</script></div></body></html>'
      );
    }
  });

  req.pipe(proxyReq, { end: true });
}

app.use((req, res) => proxyToNext(req, res));

// ─── HTTP server + WebSocket proxy ───────────────────────────────────────────

const server = http.createServer(app);
const wss    = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws/gateway') {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    return;
  }
  // Proxy all other WS upgrades to Next.js (HMR in dev mode)
  const proxySocket = net.createConnection(NEXT_PORT, '127.0.0.1');
  proxySocket.on('connect', () => {
    const hdrs = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\r\n');
    proxySocket.write(`${req.method} ${req.url} HTTP/1.1\r\n${hdrs}\r\n\r\n`);
    if (head?.length) proxySocket.write(head);
    socket.pipe(proxySocket);
    proxySocket.pipe(socket);
  });
  proxySocket.on('error', () => { try { socket.destroy(); } catch {} });
  socket.on('error', () => { try { proxySocket.destroy(); } catch {} });
});

wss.on('connection', (clientWs) => {
  let gwWs         = null;
  let gwReady      = false;
  let connectSent  = false;
  const pending    = [];

  gwWs = new WebSocket(GATEWAY_WS_URL);

  gwWs.on('open', () => {
    // Do NOT send connect yet — wait for connect.challenge to get the nonce
    // If no challenge arrives within 500ms, send without a nonce (fallback)
    setTimeout(() => {
      if (!connectSent) sendConnect('');
    }, 500);
  });

  function sendConnect(challengeNonce) {
    if (connectSent) return;
    connectSent = true;

    const scopes = device ? DEVICE_SCOPES : ['operator.read', 'operator.write'];
    const auth   = { token: GATEWAY_TOKEN };
    if (device?.operatorToken) auth.deviceToken = device.operatorToken;

    let deviceParam = undefined;
    if (device?.privateKeyPem) {
      const signedAtMs = Date.now();
      const signStr = buildSignString({
        deviceId:    device.deviceId,
        clientId:    'cli',
        clientMode:  'cli',
        role:        'operator',
        scopes,
        signedAtMs,
        token:       GATEWAY_TOKEN,
        nonce:       challengeNonce,
      });
      const signature = signEd25519(device.privateKeyPem, signStr);
      deviceParam = {
        id:        device.deviceId,
        publicKey: device.publicKey,
        signature,
        signedAt:  signedAtMs,
        nonce:     challengeNonce,
      };
    }

    const params = {
      minProtocol: 4, maxProtocol: 4,
      client: { id: 'cli', version: '1.0.0', platform: 'win32', mode: 'cli' },
      role: 'operator', scopes,
      caps: ['tool-events'],
      auth,
      ...(deviceParam ? { device: deviceParam } : {}),
    };

    gwWs.send(JSON.stringify({ type: 'req', id: 'dc-connect', method: 'connect', params }));
  }

  gwWs.on('message', (data) => {
    const text = data.toString();
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(text);
    try {
      const msg = JSON.parse(text);

      // Intercept challenge — sign and send connect
      if (msg.type === 'event' && msg.event === 'connect.challenge' && !connectSent) {
        sendConnect(msg.payload?.nonce || '');
        return;
      }

      if (msg.type === 'res' && msg.id === 'dc-connect') {
        if (msg.ok) {
          console.log('[gateway] connected, scopes:', JSON.stringify(msg.payload?.auth?.scopes));
          gwReady = true;
          if (clientWs.readyState === WebSocket.OPEN)
            clientWs.send(JSON.stringify({ type: 'proxy', event: 'connected' }));
          for (const q of pending) gwWs.send(q);
          pending.length = 0;
        } else {
          console.error('[gateway] connect failed:', msg.error?.message);
          if (clientWs.readyState === WebSocket.OPEN)
            clientWs.send(JSON.stringify({ type: 'proxy', event: 'error', message: msg.error?.message }));
        }
      }
    } catch { /* non-JSON frame */ }
  });

  gwWs.on('error', err => {
    console.error('[gateway-ws]', err.message);
    if (clientWs.readyState === WebSocket.OPEN)
      clientWs.send(JSON.stringify({ type: 'proxy', event: 'error', message: err.message }));
  });

  gwWs.on('close', () => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'proxy', event: 'disconnected' }));
      clientWs.close();
    }
  });

  clientWs.on('message', data => {
    const text = data.toString();
    if (gwReady && gwWs?.readyState === WebSocket.OPEN) gwWs.send(text);
    else pending.push(text);
  });

  clientWs.on('close', () => gwWs?.close());
  clientWs.on('error', err => { console.error('[client-ws]', err.message); gwWs?.close(); });
});

// ─── Start Next.js ────────────────────────────────────────────────────────────

function spawnNextJs() {
  const hasBuild = fs.existsSync(path.join(CLIENT_DIR, '.next', 'BUILD_ID'));
  const mode     = hasBuild ? 'start' : 'dev';
  const args     = mode === 'dev'
    ? ['next', 'dev', '-p', String(NEXT_PORT), '--turbopack']
    : ['next', 'start', '-p', String(NEXT_PORT)];

  console.log(`[next] ${mode.toUpperCase()} on port ${NEXT_PORT}${hasBuild ? '' : ' (no build found — run npm run build for faster startup)'}`);
  // On Windows use cmd /c to run npx; on Unix run directly (no shell needed)
  const [cmd, cmdArgs] = process.platform === 'win32'
    ? ['cmd', ['/c', 'npx', ...args]]
    : ['npx', args];
  const proc = spawn(cmd, cmdArgs, {
    cwd:   CLIENT_DIR,
    stdio: 'inherit',
    env:   { ...process.env },
  });
  proc.on('error', err  => console.error('[next] spawn error:', err.message));
  proc.on('exit',  code => code !== 0 && console.error(`[next] exited with code ${code}`));
  ['exit', 'SIGINT', 'SIGTERM'].forEach(sig =>
    process.on(sig, () => { try { proc.kill(); } catch {} })
  );
  return proc;
}

spawnNextJs();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ DeepClaw UI: http://127.0.0.1:${PORT}`);
  console.log(`   Next.js:     http://127.0.0.1:${NEXT_PORT} (proxied)`);
  console.log(`   WS proxy:    ws://127.0.0.1:${PORT}/ws/gateway → ${GATEWAY_WS_URL}`);
  console.log(`   Workspace:   ${WORKSPACE_ROOT}`);
});
