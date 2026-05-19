# OpenClaw Scientist 🔬

> 深度科研 Agent for [OpenClaw](https://openclaw.ai) — 文献漏斗 + 证据链追踪 + 双模式流水线 + 开题 PPT 生成

---

## 功能概览

OpenClaw Scientist（小科）是一个完整的科研辅助 Agent，覆盖从主题确定到开题答辩 PPT 的全流程：

```
用户提出研究主题
  └─> 阶段 1+2  arxiv-search + semantic-scholar  搜索与筛选候选文献
      └─> 阶段 3  paper-reader                   精读 Top 5-8 篇，提取结构化笔记
          └─> 阶段 4  literature-synthesis        综合分析，识别 Research Gap
              └─> 阶段 5  research-planner ★      制定研究假设与实验方案（用户选方向）
                  └─> 阶段 6  report-writer       生成完整科研报告（Markdown + HTML）
                      └─> 阶段 7  science-slides  生成开题报告 PPT（.pptx，中文学术风格）

（可选质量保障，在阶段 6 完成后按需触发）
                      ├─> 阶段 8  claim-auditor   引用忠实度审计（防引用漂移）
                      └─> 阶段 9  paper-reviewer  双流同行评审 + Devil's Advocate
```

每个 Skill 可单独调用，无需走完全流程。

---

## 核心特性

### 双模式流水线

| 模式 | 说明 |
|------|------|
| **AUTO 全自动** | 7 个阶段自动串行执行，仅在研究方向选择时等待 |
| **INTERACTIVE 交互审核** | 每阶段完成后展示结果卡片，用户确认或提出改进后再继续 |

自适应检查点：连续 2 次 FULL 审核无新信息时自动降为 SLIM（轻量确认）；研究方向选择和报告完成为 MANDATORY，永不降级。

### 文献三步漏斗

搜索（20-40 篇）→ Triage 评分筛选 → 精读（Top 5-8 篇），防止无关文献消耗上下文。

Triage 评分维度：主题相关性 × 文献质量 × 全文可访问性 × 贡献类型加权。

### 证据链协议（Evidence Protocol）

每条 AI 报告中的文献结论都必须追溯到原文段落：

```
EV-001  原文："Our model achieves 94.2% accuracy..."  (paper 2603.08874)
         ↓
report.md §2 第 3 段："该模型准确率达 94.2% [EV-001]"
```

证据覆盖率要求 ≥ 80%，否则报告验收门不通过。无法从文献验证的信息必须显式标注 `[MATERIAL GAP]`，禁止静默填充。

**引用忠实度审计（Skill 8）**：抽样核查 claim_text 是否忠实于 original_text，判定为 faithful / drifted / unsupported，drifted 须给修改建议，unsupported 须修改正文。

**双流同行评审（Skill 9）**：4 位标准评审（主题专家 / 方法专家 / 写作审稿人 / 领域外视角）独立评分，加上 Devil's Advocate 主动寻找逻辑漏洞与竞争性解释。DA-CRITICAL 项阻断评审门。

### 8 道验收门

| 阶段 | 验收门 | 关键条件 |
|------|--------|---------|
| S1+S2 | 文献覆盖门 | ≥5 篇含摘要；≥1 篇高引（>50） |
| S3 | 精读完整门 | ≥5 篇结构化笔记；evidence.json ≥10 条 EV |
| S4 | 综述质量门 | Related Work ≥200 词；Gap ≥3 条 |
| S5 | 研究计划门 | 假设含可验证指标；≥1 数据集已识别 |
| S6 | 报告完整门 | 8 个章节齐全；证据覆盖率 ≥80%；[MATERIAL GAP] ≤20% |
| S7 | PPT 结构门 | ≥12 张幻灯片；10 类必要页均存在 |
| S8 | 审计完整门 | high EV 全查；unsupported 项已修；审计报告已追加 |
| S9 | 评审完整门 | 4 位评审完成评分卡；DA 框架完整；DA-CRITICAL 项已回应 |

> S8/S9 为可选质量保障阶段，不强制纳入主流水线。

### 执行层（v0.7.0 新增）

验收门从文字要求升级为脚本强制计算，门控结果持久化，跨会话可恢复：

```
scripts/
├── init_project.py    # 初始化完整项目文件结构（新项目必须通过此脚本启动）
├── gate_check.py      # 读取实际文件计算门控条件，PASS/FAIL 写入 pipeline_state.json
├── ev_manager.py      # 管理 evidence.json（增/查/覆盖率/gap统计）
├── passport.py        # SHA256 内容哈希 + 物料护照验证（跨会话完整性）
└── session_restore.py # 跨会话状态恢复卡片
```

```bash
# 新项目启动
python scripts/init_project.py my-project --mode INTERACTIVE

# 每阶段结束后（示例：S3 精读完成后）
python scripts/passport.py my-project sign state/projects/my-project/project.md 3
python scripts/gate_check.py my-project 3

# 添加证据记录
python scripts/ev_manager.py my-project add \
  --paper-id 2310.08560 \
  --original "Our model achieves 94.2% on GSM8K..." \
  --confidence high

# 会话恢复
python scripts/session_restore.py my-project
```

所有脚本仅依赖 Python 3.9+ stdlib，无需额外安装。

### MCP 工具层（v0.8.0 新增）

通过 OpenClaw MCP 协议对接本地与云端计算服务，配置写入 `~/.openclaw/openclaw.json`：

| MCP Server | 用途 |
|------------|------|
| `math` | 本地统计计算（scipy/sympy）— 精确数值 |
| `wolfram` | Wolfram Alpha LLM API — 自然语言数学/物理问题 |
| `academic-search` | 学术文献免费搜索 |
| `academic-write` | 学术写作辅助 |
| `academic-chart` | 学术图表生成 |
| `academic-formatter` | 格式化排版 |

Math-analysis Companion Skill 内置工具路由规则：LLM 自主判断何时调用 Wolfram（自然语言推导）或本地 scipy/sympy（可重现数值计算）。

### Workspace 文件浏览器（v0.8.1 新增）

独立 Express 服务，让团队成员通过浏览器查看研究产出（报告、PPT、JSON 证据链），无需直接访问服务器文件系统。

---

## 安装

### 前提条件

- [OpenClaw](https://openclaw.ai) 已安装
- Python 3.9+（用于执行层脚本、PPT 生成和 HTML 导出）
- Node.js 18+（用于 Workspace 文件浏览器）
- （可选）Semantic Scholar API Key，申请地址：https://api.semanticscholar.org/api-docs/

### 方法一：Git Clone（推荐）

```bash
git clone https://github.com/YihangHu2004/openclaw-deepscientist.git
cd openclaw-deepscientist
bash install.sh
```

### 方法二：手动安装

```bash
# 1. 将 workspace/ 内容复制到 ~/.openclaw/workspace-scientist/
mkdir -p ~/.openclaw/workspace-scientist
cp -r . ~/.openclaw/workspace-scientist/

# 2. 填写个人配置
cp USER_CONFIG.example.md ~/.openclaw/workspace-scientist/USER_CONFIG.md
# 编辑 USER_CONFIG.md，填入称呼和邮箱

# 3. 在 ~/.openclaw/openclaw.json 的 agents.list 中添加：
# { "id": "scientist", "model": "deepseek/deepseek-v4-pro",
#   "workspace": "~/.openclaw/workspace-scientist" }

# 4. 安装 Python 依赖
pip install trafilatura python-pptx markdown numpy scipy sympy

# 5. 安装 Workspace 文件浏览器依赖
cd extensions/workspace-api && npm install
```

### 更新框架（不影响个人数据）

```bash
git pull
bash install.sh --update
```

`--update` 模式只覆盖 `SCIENTIST.md` 和 `skills/`，**不会触碰** `USER_CONFIG.md`、`MEMORY.md`、`state/` 中的研究数据。

---

## 配置

安装完成后，编辑 `~/.openclaw/workspace-scientist/USER_CONFIG.md`：

```markdown
## 用户信息
- 称呼: 你的昵称
- 邮箱: your-email@example.com   ← 用于 Unpaywall 全文 API（必填）
- 机构: 你的学校 / 单位

## API Keys（可选）
- Semantic Scholar Key: xxx      ← 有则限流更少
```

---

## 使用

重启 OpenClaw 后，在对话框输入 `@scientist` 切换到小科：

```
@scientist 帮我研究 Chain-of-Thought Reasoning 的最新进展
```

小科会询问运行模式（AUTO / INTERACTIVE），然后开始文献搜索。

**质量审计**：
```
@scientist 审计报告中的引用是否忠实原文       → Skill 8（claim-auditor）
@scientist 对报告进行同行评审                → Skill 9（paper-reviewer，full 模式）
@scientist 快速扫描报告漏洞                  → Skill 9（quick 模式，仅 DA，10 分钟内）
```

---

## Workspace 文件浏览器

独立于 OpenClaw 网关的轻量文件服务器，运行在端口 18790，用于浏览和预览研究产出文件。

### 架构说明

```
OpenClaw 网关 :18789   ←  @scientist 对话
Workspace UI  :18790   ←  文件浏览器（独立进程）
```

两者完全独立。Workspace UI 不需要登录，仅限本机访问（127.0.0.1）。

### 快速启动

```bash
# 进入 Workspace 目录
cd ~/.openclaw/workspace-scientist

# 启动文件浏览器（默认端口 18790）
node extensions/workspace-api/server.js

# 自定义端口
node extensions/workspace-api/server.js 18791
```

启动成功后，终端输出：
```
✅ Workspace UI: http://127.0.0.1:18790
   Projects root: ~/.openclaw/workspace-scientist/state/projects
```

浏览器打开 **http://127.0.0.1:18790** 即可访问。

### 依赖安装

`bash install.sh` 会自动安装 Node.js 依赖（步骤 8）。若手动安装：

```bash
cd ~/.openclaw/workspace-scientist/extensions/workspace-api
npm install
```

仅需 `express` 包，无其他依赖。

### 使用方式

1. 打开 http://127.0.0.1:18790
2. 在输入框中填入项目 slug（如 `chain-of-thought-reasoning`）
3. 点击「浏览」查看文件树：
   - `.html` / `.md` / `.txt` / `.json` / `.csv` — 在线预览
   - `.pptx` / `.pdf` — 直接下载

### API 端点

服务器同时提供 REST API，可供团队自动化脚本调用：

| 端点 | 用途 |
|------|------|
| `GET /api/workspace/files?path=<slug>` | 列出目录内容 |
| `GET /api/workspace/file?path=<slug>/report.html` | 获取文件内容 |

路径均相对于 `state/projects/` 根目录，越界访问返回 403。

### 团队成员使用

1. `git clone` 仓库后运行 `bash install.sh`
2. 填写个人 `USER_CONFIG.md`
3. 按上述步骤启动 `server.js`
4. 各成员的 `state/projects/` 完全独立（gitignored），浏览器看到的是本机数据

---

## 数据隐私

本仓库遵循三层数据分离原则：

| 层 | 内容 | 是否入 Git |
|----|------|-----------|
| 公开层 | SCIENTIST.md + skills/ | ✅ |
| 本地配置层 | USER_CONFIG.md + MEMORY.md | ❌（gitignored） |
| 研究数据层 | state/projects/ + 报告/PPT | ❌（gitignored） |

**请勿将 `openclaw.json`（含 API 密钥）提交到 Git。**

---

## 成员协作

```
维护者   git push → GitHub
成员     git clone + bash install.sh → 各自独立的 USER_CONFIG.md + MEMORY.md + state/
```

每位成员拥有完全独立的个人配置和研究数据，共享同一套框架代码。

---

## 技术栈

- **Agent 框架**: OpenClaw Workspace 协议（SCIENTIST.md 驱动）
- **文献数据库**: arXiv API + Semantic Scholar Graph API + Unpaywall
- **HTML 提取**: Trafilatura → BeautifulSoup → 正则（三层降级）
- **PPT 生成**: python-pptx（中文学术模板）
- **HTML 报告**: Python `markdown` 库 + 内嵌 CSS
- **搜索缓存**: SHA1 查询 hash → search_cache.json
- **数学计算 MCP**: scipy（统计检验）+ sympy（符号运算）+ Wolfram Alpha LLM API
- **学术云服务 MCP**: Academic Free MCP Servers（搜索 / 写作 / 图表 / 排版）
- **Workspace 文件浏览器**: Node.js + Express（独立服务，端口 18790）

---

## 版本

当前版本：**v0.8.1**（2026-05-19）

详见 [CHANGELOG.md](CHANGELOG.md)。

---

## License

MIT
