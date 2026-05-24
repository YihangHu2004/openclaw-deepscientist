# OpenClaw Scientist 🔬

> 深度科研 Agent for [OpenClaw](https://openclaw.ai) — 文献漏斗 + 证据链追踪 + 双模式流水线 + 开题 PPT 生成 + 套磁邮件流水线

---

## 功能概览

OpenClaw Scientist（DeepClaw）是一个完整的科研辅助 Agent，覆盖从主题确定到开题答辩 PPT 的全流程：

```
用户提出研究主题
  └─> 阶段 1+2  arxiv-search + semantic-scholar  搜索与筛选候选文献
      └─> 阶段 3  paper-reader                   精读 Top 5-8 篇，提取结构化笔记
          └─> 阶段 4  literature-synthesis        综合分析，识别 Research Gap
              └─> 阶段 5  research-planner ★      制定研究假设与实验方案（用户选方向）
                  └─> 阶段 6  report-writer       生成完整科研报告（Markdown + HTML）
                      └─> 阶段 7  claim-auditor   引用忠实度审计（防引用漂移）【强制】
                          └─> 阶段 8  paper-reviewer  双流同行评审 + Devil's Advocate【强制】

（可选，S8 评审门通过后用户决定）
                              └─> 阶段 9  science-slides  生成开题报告 PPT（.pptx，中文学术风格）
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

**引用忠实度审计（Skill 7，强制）**：抽样核查 claim_text 是否忠实于 original_text，判定为 faithful / drifted / unsupported，drifted 须给修改建议，unsupported 须修改正文。

**双流同行评审（Skill 8，强制）**：4 位标准评审（主题专家 / 方法专家 / 写作审稿人 / 领域外视角）独立评分，加上 Devil's Advocate 主动寻找逻辑漏洞与竞争性解释。DA-CRITICAL 项阻断评审门。

### 8 道验收门

| 阶段 | 验收门 | 关键条件 |
|------|--------|---------|
| S1+S2 | 文献覆盖门 | ≥5 篇含摘要；≥1 篇高引（>50） |
| S3 | 精读完整门 | ≥5 篇结构化笔记；evidence.json ≥10 条 EV |
| S4 | 综述质量门 | Related Work ≥200 词；Gap ≥3 条 |
| S5 | 研究计划门 | 假设含可验证指标；≥1 数据集已识别 |
| S6 | 报告完整门 | 8 个章节齐全；证据覆盖率 ≥80%；[MATERIAL GAP] ≤20% |
| S7 | 审计完整门 | high EV 全查；unsupported 项已修；审计报告已追加【强制】 |
| S8 | 评审完整门 | 4 位评审完成评分卡；DA 框架完整；DA-CRITICAL 项已回应【强制】 |
| S9 | PPT 结构门 | ≥12 张幻灯片；10 类必要页均存在【可选】 |

> S7/S8 为强制阶段，S9 PPT 为可选阶段，在 S8 评审门通过后由用户决定是否生成。

### 执行层（v0.7.0 新增）

验收门从文字要求升级为脚本强制计算，门控结果持久化，跨会话可恢复：

```
scripts/
├── init_project.py       # 初始化完整项目文件结构（新项目必须通过此脚本启动）
├── gate_check.py         # 读取实际文件计算门控条件，PASS/FAIL 写入 pipeline_state.json
├── ev_manager.py         # 管理 evidence.json（增/查/覆盖率/gap统计）
├── passport.py           # SHA256 内容哈希 + 物料护照验证（跨会话完整性）
├── session_restore.py    # 跨会话状态恢复卡片
├── init_outreach.py      # 初始化套磁项目目录结构
├── outreach_manager.py   # 联系人 CRUD + 调研笔记 + 流言板 + 状态追踪
├── outreach_gate_check.py # 邮件 G3 质量门（5 项检查）
└── linkedin_scraper.py   # Bright Data LinkedIn API 封装（无 Token 时优雅跳过）
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

### 套磁流水线（v0.9.0 新增）

端到端教授联系工作流，覆盖调研 → 画像匹配 → 邮件起草 → 质量门控：

```
用户说"套磁 / cold email / 联系教授..."
  └─> STEP 0  项目初始化（slug → init_outreach.py → 录入教授信息）
      └─> O1a  主页抓取（邮箱 / 招生状态 / 实验室规模）
          └─> O1b  论文重要性评分 → top-3 研究主线聚类
              └─> O1c  实验室风格推断（工程 / 理论 / 交叉）
                  └─> O1d  软信号深度调研 + 流言板
                           （Twitter / Reddit / YouTube / 新闻 / LinkedIn / NSF）
                      └─> O1.5  邮箱确认 HARD STOP（用户必须确认）
                          └─> O2  USER_PROFILE.md × 研究主线 → ≥2 具体交集
                              └─> O3  邮件起草（风格 A 技术对等 / B 学术正式 / C 探索合作）
                                  └─> O4  G3 质量门（字数 / 套话黑名单 / 专有名词 / 邮箱验证）
                                      └─> O5  用户审阅 → mark-sent / 修改循环
```

**论文重要性评分**：`paper_score = 0.35×时间 + 0.30×作者位置 + 0.20×期刊档次 + 0.15×引用率`

**流言板（Rumor Board）**：10 种软信号来源（主页 / Twitter / Reddit / LinkedIn / NSF 等），9 个相关维度（招生 / 导师风格 / 经费 / 课题组文化等），每条信号实时落盘。

**LinkedIn 集成**（可选）：填写 `Bright Data API Token` 后自动抓取教授档案 / PhD 校友去向 / 近期动态；无 Token 时自动退回 web_search 策略。

```bash
# 触发方式（在 @scientist 对话中输入任意套磁关键词即可）
@scientist 帮我给 MIT 的 Prof. X 写套磁邮件
@scientist 我要联系教授申请 RA
```

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

`--update` 模式覆盖所有框架文件（`SCIENTIST.md`、`skills/`、`pipelines/`、`scripts/`、`extensions/`、身份协议文件），**不会触碰** `USER_CONFIG.md`、`USER_PROFILE.md`、`MEMORY.md`、`state/` 中的个人数据。

---

## 配置

安装完成后，编辑以下两个配置文件（均已 gitignore，不会上传）：

**`~/.openclaw/workspace-scientist/USER_CONFIG.md`**（必填）：
```markdown
## 用户信息
- 称呼: 你的昵称
- 邮箱: your-email@example.com   ← 用于 Unpaywall 全文 API（必填）
- 机构: 你的学校 / 单位

## API Keys（可选）
- Semantic Scholar Key: xxx      ← 有则限流更少
- Bright Data API Token: xxx     ← 用于 LinkedIn 套磁调研（无则退回 web_search）
```

**`~/.openclaw/workspace-scientist/USER_PROFILE.md`**（套磁功能必填）：
```markdown
## 研究方向
LLM reasoning / multimodal learning / ...

## 代表性项目 / 论文
- 项目A：一句话描述

## 技能
Python, PyTorch, CUDA, ...

## 目标
- 场景：PhD / RA
- 开始时间：2027 秋
```

---

## 使用

重启 OpenClaw 后，在对话框输入 `@scientist` 切换到DeepClaw：

```
@scientist 帮我研究 Chain-of-Thought Reasoning 的最新进展
```

DeepClaw会询问运行模式（AUTO / INTERACTIVE），然后开始文献搜索。

**质量评审**（S6 完成后自动进入）：
```
@scientist 审计报告中的引用是否忠实原文       → Skill 7（claim-auditor，强制）
@scientist 对报告进行同行评审                → Skill 8（paper-reviewer，full 模式，强制）
@scientist 快速扫描报告漏洞                  → Skill 8（quick 模式，仅 DA，10 分钟内）
@scientist 生成开题报告 PPT                  → Skill 9（science-slides，可选）
```

---

## DeepClaw UI（对话界面，v0.10.0 新增）

现代化三面板对话界面，运行在端口 **19000**，提供：
- 左侧：Session 列表（历史对话切换）
- 中间：实时流式对话区（支持 Markdown、工具调用折叠、思考过程展示）
- 右侧：Workspace 文件浏览器（在线预览 / 下载研究产出）

### 架构说明

```
OpenClaw 网关 :18789   ←  @scientist 对话（WebSocket）
DeepClaw UI   :19000   ←  对话 + 文件浏览器（代理服务器）
```

代理服务器（`deepclaw-ui/server/index.js`）持有设备密钥，完成 **Ed25519 签名认证**后代表浏览器访问网关，浏览器无需接触 token。

### 前提条件

- 本机已完成 OpenClaw 设备配对（即 `~/.openclaw/identity/device.json` 存在）
- Node.js 18+
- 已启动 OpenClaw 网关（`openclaw gateway start`）

### 快速启动

**生产模式**（推荐）：

```bash
cd ~/.openclaw/workspace-scientist/deepclaw-ui

# 首次：构建前端
cd client && npm install && npm run build && cd ..

# 启动代理服务器（同时托管前端静态文件）
node server/index.js

# 访问
open http://127.0.0.1:19000
```

**开发模式**（热更新）：

```bash
# 终端 1：代理服务器
node ~/.openclaw/workspace-scientist/deepclaw-ui/server/index.js

# 终端 2：Next.js 开发服务器
cd ~/.openclaw/workspace-scientist/deepclaw-ui/client
npm run dev   # 端口 3000，自动代理 API 到 19000
```

### 依赖安装

`bash install.sh` 会自动安装（步骤 9）。若手动安装：

```bash
cd ~/.openclaw/workspace-scientist/deepclaw-ui
npm install --prefix server
npm install --prefix client
```

### 更新

```bash
git pull && bash install.sh --update
# --update 模式会通过 rsync 同步 deepclaw-ui/（排除 node_modules）
```

---

## Workspace 文件浏览器（轻量版，端口 18790）

独立于 OpenClaw 网关的轻量文件服务器，运行在端口 18790，用于浏览和预览研究产出文件。无需认证，适合团队共享访问。

> **注意**：DeepClaw UI（:19000）内置了功能更完整的文件浏览器。:18790 作为轻量独立选项保留。

### 架构说明

```
OpenClaw 网关 :18789   ←  @scientist 对话
Workspace UI  :18790   ←  文件浏览器（独立进程，无需登录）
DeepClaw UI   :19000   ←  对话 + 文件浏览器（需设备配对）
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
| 公开框架层 | SCIENTIST.md + skills/ + pipelines/ + scripts/ | ✅ |
| 本地配置层 | USER_CONFIG.md + USER_PROFILE.md + MEMORY.md | ❌（gitignored） |
| 研究数据层 | state/projects/ + state/outreach/ + 报告/PPT | ❌（gitignored） |

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
- **DeepClaw UI**: Next.js 15 + React 19 + Tailwind CSS + Node.js 代理服务器（端口 19000，Ed25519 设备认证）

---

## 版本

当前版本：**v0.10.0**（2026-05-24）

详见 [CHANGELOG.md](CHANGELOG.md)。

---

## License

MIT
