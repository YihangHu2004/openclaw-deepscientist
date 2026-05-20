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
    const requestedPath = req.query.path;
    if (!requestedPath) return res.status(400).send('Missing path parameter');

    const filePath = path.resolve(WORKSPACE_ROOT, requestedPath);
    if (!filePath.startsWith(WORKSPACE_ROOT)) return res.status(403).send('Forbidden');

    // 检查文件是否存在并获取信息
    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch (err) {
      console.error('stat error for', filePath, err);
      return res.status(404).send('File not found');
    }
    if (!stat.isFile()) return res.status(400).send('Not a file');

    const ext = path.extname(filePath).toLowerCase();

    // 文本文件直接返回内容
    if (['.html', '.md', '.txt', '.json', '.csv'].includes(ext)) {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      res.type(ext === '.html' ? 'text/html' : 'text/plain').send(data);
      return;
    }

    // 其他文件：手动流式传输，完全避开 res.download
    const fileName = path.basename(filePath);
    const mime = {
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.zip': 'application/zip',
    }[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Content-Length': stat.size,
    });

    const readStream = fs.createReadStream(filePath);
    readStream.on('error', (streamErr) => {
      console.error('Stream error:', streamErr);
      // 如果响应头还没发，可以返回 500
      if (!res.headersSent) {
        res.status(500).send('Stream error');
      } else {
        res.end();
      }
    });
    readStream.pipe(res);
  } catch (err) {
    console.error('File serving error:', err);
    res.status(500).send(err.message);
  }
});

// ---------- 静态 UI ----------
app.use('/', express.static(UI_ROOT));

http.createServer(app).listen(PORT, '127.0.0.1', () => {
  console.log(`✅ Workspace UI: http://127.0.0.1:${PORT}`);
  console.log(`   Projects root: ${WORKSPACE_ROOT}`);
});
