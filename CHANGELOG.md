# Changelog

All notable changes to OpenClaw Scientist will be documented here.

## [0.9.0] - 2026-05-22

### 新增：套磁（Outreach）完整流水线

**核心流程 O0–O5**（`pipelines/outreach.md`）

- **STEP 0**：项目初始化（slug 确认 → `init_outreach.py` → 教授联系人录入）
- **O1a**：主页与邮箱抓取（主页 / 邮箱 / 招生状态）
- **O1b**：论文重要性评分（`paper_score = 0.35×时间 + 0.30×作者位置 + 0.20×期刊档次 + 0.15×引用率`）→ top-3 研究主线聚类
- **O1c**：实验室风格推断（engineering / theory / interdisciplinary）
- **O1d**：软信号深度调研 + 流言板（平台特异策略：Twitter / Reddit / YouTube / 新闻 / LinkedIn / NSF）
- **O1.5**：邮箱确认 HARD STOP（用户确认后 `verify-email`）
- **O2**：用户画像匹配（`USER_PROFILE.md` × 教授研究主线 → ≥2 具体交集）
- **O3**：邮件起草（风格 A 技术对等 / B 学术正式 / C 探索合作）
- **O4**：质量门（字数 / 套话黑名单 / 专有名词 / 邮箱验证）
- **O5**：用户审阅 → `mark-sent` / 修改循环

**新增脚本**

- `scripts/init_outreach.py <slug>`：初始化 `state/outreach/<slug>/` 目录结构
- `scripts/outreach_manager.py <slug> <cmd>`：联系人 CRUD + note / profile / rumor / verify-email / mark-sent / stats
- `scripts/outreach_gate_check.py <slug> G3 <CTX-xxx>`：邮件 G3 质量门（5 项检查）
- `scripts/linkedin_scraper.py <slug> <CTX-xxx> <cmd>`：Bright Data LinkedIn API 封装（profile / alumni / posts），无 Token 时优雅跳过
- `scripts/intent_router.py`：关键词意图分发路由
- `scripts/workspace_doctor.py`：工作区健康检查

**流言板（Rumor Board）**

- 10 种信号来源类型（homepage / blog / twitter / reddit / youtube / news / linkedin / ratemyprofessors / researchgate / nsfgrant）
- 9 个相关维度（openings / mentorship / personality / workload / funding / collaboration / research_direction / lab_culture / location）
- 每条信号实时落盘，不可攒批

**其他更新**

- `skills/outreach/SKILL.md`：套磁 Skill 规格文档
- `USER_PROFILE.example.md`：用户学术画像模板（套磁 O2 匹配必须）
- `USER_CONFIG.example.md`：新增 `Bright Data API Token` 字段
- `.gitignore`：新增 `USER_PROFILE.md`、`search_cache.json`、`state/outreach/*/`
- `state/outreach/.gitkeep`：确保 fresh-clone 后目录存在

**`install.sh` 修复**

- `MEMORY.template.md` 已删除 → 改用内联 heredoc 生成 MEMORY.md
- 新增 `USER_PROFILE.md` 首次初始化步骤
- 新增 `state/outreach/` 目录创建
- `--update` 模式扩展：覆盖全部框架文件（`scripts/`、`pipelines/`、`extensions/`、所有身份协议文件）

**身份协议文件统一**

- `AGENTS.md / SOUL.md / TOOLS.md / USER.md / IDENTITY.md / HEARTBEAT.md` 全部改写为薄重定向，指向 `SCIENTIST.md` 对应章节，消除 OpenClaw 默认模板覆盖 `SCIENTIST.md` 的问题

**`SCIENTIST.md` 意图检测升级（§1.2）**

- 套磁关键词内联 STEP 0（0-A/0-B/0-C）+ 明确 exec 命令，消除 "加载 SKILL.md" 的歧义
- 新增平台搜索策略表（✅/⚠️/❌ 各平台登录墙感知）

---

## [0.8.2] - 2026-05-20
### 修复：Windows 系统文件下载返回 NotFoundError
**问题**：`server.js` 的 `/api/workspace/file` 端点使用 `Express` 的 `res.download` 方法，其底层依赖
      `send` 模块对 `Windows` 反斜杠路径处理不当，导致磁盘上明确存在的文件仍返回 Not Found。
**修复**：重写文件下载逻辑，改用 fs.stat 手动检查文件存在，通过 fs.createReadStream
      流式传输文件内容，并显式设置 `Content-Type`、`Content-Disposition` 和 `Content-Length`
      响应头，完全绕过 `res.download` 及 `send` 模块的兼容性问题。同时添加 `stat` 错误日志
      便于后续排查。此修复同时兼容 Windows 与 Linux 平台。
启动方式：不变:
```
node extensions/workspace-api/server.js
```
访问：不变:
```http://127.0.0.1:18790```

## [0.8.1] - 2026-05-19

### 修复：Workspace UI 独立服务器

**问题**：`extensions/workspace-api/index.js` 使用 `module.exports = function(claw)` 格式，与 OpenClaw 插件 SDK（`definePluginEntry`）不兼容，无法通过 `plugins.load.paths` 加载；且 `/workspace` 路由被 OpenClaw 内置 chat UI 占用，`controlUi.root` 覆盖会破坏 gateway 认证连接。

**修复**：
- 新增 `extensions/workspace-api/server.js`：独立 Express 服务器，默认端口 **18790**，完全绕开插件系统
- 新增 `extensions/workspace-api/openclaw.plugin.json`：保留 manifest 供后续正式插件化参考
- `package.json` 新增 `express ^5.2.1` 依赖
- `.gitignore` 新增 `node_modules/` 和 `package-lock.json`

**启动方式**：
```
node extensions/workspace-api/server.js
```
访问：`http://127.0.0.1:18790`

---

## [0.8.0] - 2026-05-19

### 新增：MCP 工具层 + 数学分析 Skill

**MCP Server 集成（`~/.openclaw/openclaw.json`）**

- **`math`**（stdio）：基础算术 MCP server（add / sub / multiply / divide / round），来自 ResearStudio
- **`wolfram`**（stdio）：Wolfram|Alpha LLM API 接入，App ID `Q98VV64QX4`
  - `wolfram_query`：自然语言问答（积分 / 方程 / 单位换算等）
  - `wolfram_full`：返回完整分步推导（max_pods 可调）
  - `wolfram_check_equation`：验证两个表达式是否等价
  - 入口：`ResearStudio/agent/server/wolfram_tool.py`
- **`academic-write`**（SSE）：学术文本润色 / 语法优化 / 中英互译
- **`academic-search`**（SSE）：语义学术网页搜索
- **`academic-chart`**（SSE）：图表生成，支持 10+ 类型（柱 / 折线 / 饼 / 雷达 / 散点 / 气泡等）
- **`academic-formatter`**（SSE）：工具输出转 HTML / Markdown
- 后四个 server 来自 [AcademicAgentsStudio/Academic-Free-MCP-Servers](https://github.com/AcademicAgentsStudio/Academic-Free-MCP-Servers)，免费学术授权，token `aioagi.tech`

**新增 Companion Skill：`math-analysis`**（`skills/math-analysis/SKILL.md`）

- 工具选择路由表：Wolfram MCP（自然语言优先）vs exec + Python（精确数值重现）
- A. 统计验证：Welch's t 检验 / 比例检验，从汇总统计重现论文 p 值
- B. 效应量：Cohen's d / 相对提升，判断实际显著性（不只看 p 值）
- C. 符号数学：SymPy 化简 / 求导 / 积分 / 极限 / 等式验证

---

## [0.7.0] - 2026-05-19

### 新增：执行层（Execution Layer）

v0.7.0 将验收门从"君子协定"升级为"可见问责制"——脚本计算、结果可见、状态持久化。

**五个新增 Python 脚本（全部 stdlib，无额外依赖）**

- **`scripts/init_project.py <slug> [--mode AUTO|INTERACTIVE]`**
  - 初始化 `state/projects/<slug>/` 完整目录结构
  - 创建：`pipeline_state.json`（mode + stage_status 全 pending + material_passport）/ `evidence.json`（空 items）/ `project.md`（模板）/ `TODO.md`（9 个阶段 checkbox）/ `SUMMARY.md`（空）/ `slides/`（空目录）
  - 如 `state/baselines.json` 不存在则同时初始化
  - **新项目必须通过此脚本启动，不得手动创建文件**

- **`scripts/gate_check.py <slug> <stage> [--verbose]`**
  - 读取实际文件计算门控条件，输出 PASS/FAIL 框 + JSON
  - 支持 S2（文献覆盖门）/ S3（精读完整门）/ S4（综述质量门）/ S5（研究计划门）/ S6（报告完整门）/ S7（PPT 结构门）
  - 退出码：0 = PASS，1 = FAIL
  - 结果写入 `pipeline_state.json.gate_results`，PASS 时自动推进 `current_stage`

- **`scripts/ev_manager.py <slug> <command>`**
  - `add`：自增 EV-xxx ID，追加到 evidence.json（**禁止手动编辑 items 数组**）
  - `list [--stage] [--confidence]`：过滤显示 EV 记录
  - `coverage <report_path>`：正则统计文献结论句 EV 覆盖率（要求 ≥80%）
  - `gap-count <report_path>`：统计 [MATERIAL GAP] 比例（上限 20%）

- **`scripts/passport.py <slug> <command>`**
  - `sign <artifact> <stage>`：计算 SHA256，追加到 `pipeline_state.json.material_passport`（append-only）
  - `verify <artifact>`：对比当前哈希与护照记录，文件被外部修改时输出 ⚠️
  - `list`：列出所有护照条目

- **`scripts/session_restore.py <slug>`**
  - 读取 `pipeline_state.json`，打印完整恢复卡片（项目名 / 模式 / 当前阶段 / 阶段进度条 / EV 数量 / 物料护照数 / 最近门控结果）

**SCIENTIST.md 协议更新**

- **§1.2 强制初始化协议**：会话开始时必须扫描 `state/projects/`；有项目 → 运行 `session_restore.py`；无项目 → 运行 `init_project.py` 后方可开始 Skill
- **§1.2 门控检查规则**：每阶段结束必须调用 `gate_check.py`；脚本输出必须展示给用户，未展示不得声称阶段完成
- **§1.7 证据强制协议**：新增 `ev_manager.py add` 调用说明；禁止手动编辑 evidence.json items 数组

**各 SKILL.md 新增「执行步骤（强制）」节**

- S1–S9 所有 9 个 SKILL.md 末尾追加固定格式的执行步骤（passport.py sign + gate_check.py 调用，S8/S9 可选）
- 明确说明每个阶段的主要产出文件、签署命令和阶段编号

**SKILL_REGISTRY.md 新增「执行层脚本」表格**

- 列出 5 个脚本的功能与调用时机

### 架构边界（诚实评估）

| 能力 | v0.7.0 | 说明 |
|------|--------|------|
| 门控条件自动计算（从文件读取） | ✅ | gate_check.py |
| 门控结果持久化 | ✅ | pipeline_state.json.gate_results |
| 证据记录结构化管理 | ✅ | ev_manager.py |
| 跨会话状态恢复 | ✅ | session_restore.py |
| 内容哈希验证 | ✅ | passport.py |
| 完全防止 LLM 绕过门控 | ❌ | 无 daemon；门控可见但不可强制拦截 |

---

## [0.6.0] - 2026-05-19

### 新增

**两个质量保障 Skill（移植自 Imbad0202/academic-research-skills）**

- **Skill 8 · `claim-auditor`（引用忠实度审计）** — `skills/claim-auditor/SKILL.md`
  - 4 步流程：抽样（all high + 30% medium EV）→ 取回原文 → 逐条核查 → 输出审计报告
  - 判定三档：`faithful`（忠实）/ `drifted`（漂移，须给修改建议）/ `unsupported`（无根据，必须修改）
  - 结果追加到 `report.md` 附录，同步更新 `evidence.json` 的 `audit_result` 字段
  - 验收门：high EV 全查、medium 抽查 ≥30%、unsupported 项已修、审计报告已追加

- **Skill 9 · `paper-reviewer`（双流同行评审）** — `skills/paper-reviewer/SKILL.md`
  - 5 人评审团：评审 A（主题专家）/ B（方法专家）/ C（写作审稿人）/ D（领域外视角）+ Devil's Advocate
  - **Sprint Contract 预承诺**：每位评审在阅读报告前写下评分标准，防止后验合理化
  - 标准评分卡（A/B/C/D）：研究贡献 / 方法合理性 / 证据质量 / 可复现性（各 1-5 分）
  - **DA 独立框架**：竞争性解释 / 逻辑漏洞 / 被忽视的对立文献 / DA 裁决（🔴 DA-CRITICAL 阻断 / 🟡 DA-WARNING）
  - 共识汇总：CONSENSUS-4 / CONSENSUS-3 / SPLIT / DA-CRITICAL 四级
  - 输出路径：`state/projects/<slug>/review/peer_review_{日期}.md`

**SCIENTIST.md 核心协议升级（§1.6–§1.9）**

- **§1.6 · 自适应检查点（Adaptive Checkpoints）**（移植）
  - 三级检查点：FULL（全量审核）/ SLIM（轻量确认）/ MANDATORY（不可跳过）
  - `consecutive_confirms` 计数器：连续 2 次 FULL 无新信息自动降为 SLIM
  - MANDATORY 检查点（研究方向选择、报告完成）永不降级

- **§1.7 · [MATERIAL GAP] 防泄露协议**（移植）
  - 当信息无法从文献验证时，必须显式标注 `[MATERIAL GAP]` 而非静默生成
  - 追踪 `gap_count` 和总结论句数，比例超 20% 须返回精读补充
  - 验收门新增条件：[MATERIAL GAP] 比例 ≤ 20%

- **§1.8 · 物料护照（Material Passport）**（移植）
  - `pipeline_state.json` 新增 `material_passport` 数组，记录每条产出的 `content_hash`（SHA256）
  - 防止跨阶段"偷换物料"——每个阶段引用上游产出必须与哈希匹配
  - 格式：`{ artifact, stage, hash_sha256, timestamp, gate_status }`

- **§1.9 · 模式谱与 Socratic 对话架构**（移植）
  - 模式谱表格：每个 Skill 的忠实度 vs 独创性定位（S1-S7）
  - 5 层 Socratic 对话（澄清 → 假设探测 → 证据推理 → 观点 → 推论）
  - 收敛条件：用户明确选择 / 连续 2 轮无新信息 / 用户主动要求计划

### 更新

**现有 Skill 强化（移植）**

- **paper-reader (S3)**：新增「防泄露协议」节
  - 禁止从训练记忆填充论文内容；只能使用 `web_fetch` 实际获取的文本
  - [MATERIAL GAP] 标注示例 + 审计触发流程
  - 追踪 `gap_count`，写入 SUMMARY.md 阶段 3 摘要

- **literature-synthesis (S4)**：新增「Step 6：Sprint Contract 预承诺」
  - 综述草稿开始前写下合格标准（EV 密度 / Gap 数量 / 对比表行数 / [MATERIAL GAP] 上限）
  - 预承诺写入 `project.md` 头部，完成后按标准核查，不得事后修改

- **research-planner (S5)**：新增「Socratic 对话引导」（5 层表格）
  - 意图模糊时优先进入对话引导，而非直接输出计划
  - 收敛后进入 PLANNER-EXECUTOR 微架构

- **report-writer (S6)**：新增「写作前证据预审（Sprint Contract）」
  - 先写预承诺评分标准（EV 覆盖率目标 / [MATERIAL GAP] 上限 / 各章节 EV 最低数）
  - 无证据支撑的声明必须改写或打 `[MATERIAL GAP]`，不得删除信息缺口
  - 验收门新增两条：[MATERIAL GAP] ≤ 20%、预承诺记录已写入报告头部

### SKILL_REGISTRY.md

- 从单行指针扩展为完整索引表（含 S1-S9 所有 Skill）
- 新增「质量保障 Skill」分类（S8/S9）
- 补充 DA-CRITICAL 阻断规则说明

---

## [0.5.0] - 2026-05-19

### 新增

**Slides 用户模板支持**
- `skills/science-slides/SKILL.md` 升级为四步工作流，新增 **Step 0：检测用户模板**
- **模板模式**：检测 `~/slides/templates/*.pptx` 或用户指定路径，有则用 `Presentation(template_path)` 继承背景图/主题/字体
- **`clone_slide` 克隆函数**：完整复制幻灯片（含图片关系 rId 重映射），支持内容页背景多次复用
- **`set_placeholder` 修复**：清除占位符时删除所有段落（非仅第一段），防止模板多段残留文字
- 工作流说明更新：模板模式下 academic-zh.md 配色仅用于 HTML 预览和补充元素
- 验收门"样式来源"改为：模板文件已存在 **或** academic-zh.md 已存在（二选一）

---

## [0.3.0] - 2026-05-18

### 重构

**Skill 分拆**
- `SCIENTIST.md` Part II 从 1000+ 行缩减至 531 行，只保留流程图与 7 行概览表
- 7 个 Skill 的完整规格各自迁移至独立文件 `skills/<name>/SKILL.md`：
  - `skills/arxiv-search/SKILL.md` — 搜索流程、Triage、停止信号、异议搜索、文献覆盖门
  - `skills/semantic-scholar/SKILL.md` — S2 端点、Triage 集成、速率限制
  - `skills/paper-reader/SKILL.md` — 全文获取策略、表格提取、EV 置信度规则、精读完整门
  - `skills/literature-synthesis/SKILL.md` — Related Work、对比表、Gap 列表、confidence 规则、综述质量门
  - `skills/research-planner/SKILL.md` — 基线注册表查询、子问题分解、计划模板、研究计划门
  - `skills/report-writer/SKILL.md` — 证据预审、HTML 生成脚本、报告完整门
  - `skills/science-slides/SKILL.md` — PPT 结构、配色方案、甘特图规则、PPT 结构门

---

## [0.2.0] - 2026-05-18

### 新增（借鉴 DeepScientist + ResearStudio）

**DS-1：SUMMARY.md 阶段摘要**
- 每个 Skill（S1-S7）完成后自动追加一条结构化摘要到 `SUMMARY.md`
- 内容包含：产出统计 / 关键数值 / 核心发现，供跨会话快速恢复上下文
- S7 写入最终项目完成摘要（含全流程产出清单）

**DS-3：全局基线注册表（baselines.json）**
- 新增 `state/baselines.json`：跨项目积累数据集与基线方法（schema 见 Part III）
- Skill 5 规划时先查注册表，命中则复用，未命中则搜索后写入
- §1.4 新增注册表格式说明；§1.2 项目目录新增全局文件引用

**RS-1：论文表格与图注专项提取**
- Skill 3 精读时，在 Trafilatura 提取完主文本后，额外用 BeautifulSoup 提取全部 `<table>` → Markdown 表格
- 同步提取 `<figcaption>` 图注（标题 + 位置说明）
- 表格数据优先用于 Skill 4 方法对比表；EV 引用表格数据时 claim_location 注明 "Table N"

**RS-2：Gap 子问题分解**
- Skill 5 研究计划模板新增「Gap 子问题分解」节
- 每个 Research Gap 转化为 N 条可证伪子问题（可用实验数值回答 yes/no）
- 子问题写入 SUMMARY.md 阶段 5 摘要，方便团队对齐研究目标

**RS-3：EV 置信度分级（confidence）**
- evidence.json 每条记录新增 `confidence` 字段：`high` / `medium` / `low`
- 按获取方式自动设定：全文实验数据 → high；截断全文 → medium；摘要 → low
- Skill 4 综述规则：核心数值声明须有 ≥1 条 high EV；low EV 引用须加注"待全文确认"
- Skill 3 提取规则新增置信度设置对照表

---

## [0.1.0] - 2026-05-18

### 初始版本

**核心功能**
- 7 个独立科研 Skill：arxiv-search、paper-reader、semantic-scholar、literature-synthesis、research-planner、report-writer、science-slides
- 双模式流水线：AUTO（全自动）与 INTERACTIVE（阶段审核）
- 严格顺序依赖链：S1+S2 → S3 → S4 → S5 → S6 → S7

**质量保障**
- 6 道验收门（文献覆盖门 / 精读完整门 / 综述质量门 / 研究计划门 / 报告完整门 / PPT 结构门）
- 证据协议（evidence.json）：每条 AI 声明追溯到原文段落，覆盖率 ≥ 80%

**文献相关性**
- 三步文献漏斗：搜索 → Triage 评分 → 精读
- Triage 四维评分：主题相关性 × 文献质量 × 可访问性 × 贡献类型
- 搜索停止信号（4 条件）：防止盲目扩大搜索范围
- 异议文献搜索：防止确认偏见

**技术实现**
- Trafilatura → BeautifulSoup → 正则 三层 HTML 提取降级
- SHA1 查询缓存（search_cache.json）：避免重复 API 调用
- 长文截断：5000 token 上限（前 2000 + 后 1000）
- arXiv API：严格顺序请求，间隔 ≥ 3 秒

**协作与安全**
- 三层数据分离：公开框架 / 本地个人配置 / 本地研究数据
- USER_CONFIG.md：个人信息隔离，不入 Git
- install.sh --update 模式：只更新框架，保留个人数据
- pipeline_state.json：进度持久化，支持跨会话断点续读
