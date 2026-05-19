const fs = require('fs');
const path = require('path');
const express = require('express');

module.exports = function (claw) {
  // scientist workspace 根目录
  const WORKSPACE_ROOT = path.join(
    require('os').homedir(),
    '.openclaw',
    'workspace-scientist',
    'state',
    'projects'
  );

  // ---------- API：文件列表 ----------
  claw.app.get('/api/workspace/files', async (req, res) => {
    try {
      const dirPath = path.join(WORKSPACE_ROOT, req.query.path || '');
      // 安全检查
      if (!dirPath.startsWith(WORKSPACE_ROOT)) {
        return res.status(403).send('Forbidden');
      }
      const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const list = items.map(item => ({
        name: item.name,
        isDirectory: item.isDirectory()
      }));
      res.json(list);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  // ---------- API：文件内容 ----------
  claw.app.get('/api/workspace/file', async (req, res) => {
    try {
      const filePath = path.join(WORKSPACE_ROOT, req.query.path);
      if (!filePath.startsWith(WORKSPACE_ROOT)) {
        return res.status(403).send('Forbidden');
      }
      const ext = path.extname(filePath).toLowerCase();
      if (['.html', '.md', '.txt', '.json', '.csv'].includes(ext)) {
        const data = await fs.promises.readFile(filePath, 'utf-8');
        res.type(ext === '.html' ? 'text/html' : 'text/plain');
        res.send(data);
      } else {
        // 二进制文件直接下载
        res.download(filePath);
      }
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  // ---------- 静态页面：挂载到 /workspace ----------
  const workspaceUiPath = path.join(__dirname, '..', '..', 'control-ui');
  claw.app.use('/workspace', express.static(workspaceUiPath));
};
