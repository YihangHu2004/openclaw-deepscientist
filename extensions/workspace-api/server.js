/**
 * Standalone workspace file browser — run separately from OpenClaw gateway.
 * Usage: node server.js [port]
 * Default port: 18790
 * Open: http://127.0.0.1:18790
 */

const fs      = require('fs');
const path    = require('path');
const http    = require('http');
const express = require('express');

const PORT           = parseInt(process.argv[2] || '18790', 10);
const WORKSPACE_ROOT = path.join(require('os').homedir(), '.openclaw', 'workspace-scientist', 'state', 'projects');
const UI_ROOT        = path.join(__dirname, '..', '..', 'control-ui');

const app = express();

// CORS — allow browser to call from any origin
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// ---------- API：文件列表 ----------
app.get('/api/workspace/files', async (req, res) => {
  try {
    const dirPath = path.resolve(WORKSPACE_ROOT, req.query.path || '');
    if (!dirPath.startsWith(WORKSPACE_ROOT)) return res.status(403).send('Forbidden');
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    res.json(items.map(i => ({ name: i.name, isDirectory: i.isDirectory() })));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ---------- API：文件内容 ----------
app.get('/api/workspace/file', async (req, res) => {
  try {
    const filePath = path.resolve(WORKSPACE_ROOT, req.query.path);
    if (!filePath.startsWith(WORKSPACE_ROOT)) return res.status(403).send('Forbidden');
    const ext = path.extname(filePath).toLowerCase();
    if (['.html', '.md', '.txt', '.json', '.csv'].includes(ext)) {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      res.type(ext === '.html' ? 'text/html' : 'text/plain').send(data);
    } else {
      res.download(filePath);
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ---------- 静态 UI ----------
app.use('/', express.static(UI_ROOT));

http.createServer(app).listen(PORT, '127.0.0.1', () => {
  console.log(`✅ Workspace UI: http://127.0.0.1:${PORT}`);
  console.log(`   Projects root: ${WORKSPACE_ROOT}`);
});
