const fs = require('fs');
const path = require('path');

module.exports = function (claw) {
  // 你的 scientist workspace 根目录
  const WORKSPACE_ROOT = path.join(
    require('os').homedir(),
    '.openclaw',
    'workspace-scientist',
    'state',
    'projects'
  );

  // 文件列表接口
  claw.app.get('/api/workspace/files', async (req, res) => {
    try {
      const dirPath = path.join(WORKSPACE_ROOT, req.query.path || '');
      // 安全检查：只允许访问 workspace 内的目录
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

  // 文件内容接口
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
};
// ---------- 新增：挂载前端静态页面到 /workspace ----------
  const workspaceUiPath = path.join(__dirname, '..', '..', 'control-ui'); // 指向项目根目录下的 control-ui 文件夹
  claw.app.use('/workspace', express.static(workspaceUiPath));
};
