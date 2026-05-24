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
const os        = require('os');
const crypto    = require('crypto');
const express   = require('express');
const WebSocket = require('ws');
const cors      = require('cors');

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT           = parseInt(process.env.DEEPCLAW_UI_PORT || '19000', 10);
const OPENCLAW_HOME  = path.join(os.homedir(), '.openclaw');
const CLIENT_BUILD   = path.join(__dirname, '..', 'client', 'out');

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
const WORKSPACE_ROOT = path.join(OPENCLAW_HOME, 'workspace-scientist', 'state', 'projects');

// ─── Express ──────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// ─── REST: sessions list ──────────────────────────────────────────────────────

app.get('/api/sessions', (req, res) => {
  try {
    if (!fs.existsSync(SESSIONS_META)) return res.json([]);
    const meta = JSON.parse(fs.readFileSync(SESSIONS_META, 'utf-8'));
    const list = Object.entries(meta)
      .filter(([, s]) => s)
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
    const file = path.join(SESSIONS_DIR, `${req.params.id}.jsonl`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Session not found' });

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

// ─── Static: serve Next.js build ─────────────────────────────────────────────

if (fs.existsSync(CLIENT_BUILD)) {
  app.use(express.static(CLIENT_BUILD));
  app.get('*', (_req, res) => {
    const idx = path.join(CLIENT_BUILD, 'index.html');
    fs.existsSync(idx) ? res.sendFile(idx) : res.status(404).send('Build missing');
  });
} else {
  app.get('/', (_req, res) => {
    res.send(`<h2>DeepClaw UI server (:${PORT})</h2><p>Frontend not built yet. Run Next.js dev on :3000.</p>`);
  });
}

// ─── HTTP server + WebSocket proxy ───────────────────────────────────────────

const server = http.createServer(app);
const wss    = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws/gateway') {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ DeepClaw UI: http://127.0.0.1:${PORT}`);
  console.log(`   WS proxy:    ws://127.0.0.1:${PORT}/ws/gateway → ${GATEWAY_WS_URL}`);
  console.log(`   Workspace:   ${WORKSPACE_ROOT}`);
});
