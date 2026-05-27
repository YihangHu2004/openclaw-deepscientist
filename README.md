# DeepClaw

> 深度科研 Agent for [OpenClaw](https://openclaw.ai) — 文献漏斗 + 证据链追踪 + 双模式流水线 + 开题 PPT 生成 + 套磁邮件流水线

---

## 功能概览

DeepClaw 是完整的科研辅助 Agent，覆盖从主题确定到开题报告 PPT 的全流程：

```
用户提出研究主题
  └─> S1+S2  arxiv-search + semantic-scholar  搜索与筛选候选文献
      └─> S3  paper-reader                    精读 Top 5-8 篇，提取结构化笔记
          └─> S4  literature-synthesis        综合分析，识别 Research Gap
              └─> S5  research-planner ★     制定研究假设与实验方案（用户选方向）
                  └─> S6  report-writer       生成完整科研报告（Markdown + HTML）
                      └─> S7  claim-auditor   引用忠实度审计【强制】
                          └─> S8  paper-reviewer  双流同行评审 + Devil's Advocate【强制】

（S8 门通过后用户决定）
                              └─> S9  science-slides  开题报告 PPT（.pptx，中文学术风格）【可选】
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

### 证据链协议

每条 AI 报告中的文献结论都必须追溯到原文段落：

```
EV-001  原文："Our model achieves 94.2% accuracy..."  (paper 2603.08874)
         ↓
report.md §2 第 3 段："该模型准确率达 94.2% [EV-001]"
```

证据覆盖率要求 ≥ 80%，否则报告验收门不通过。无法从文献验证的信息必须显式标注 `[MATERIAL GAP]`，禁止静默填充。

**引用忠实度审计（S7，强制）**：五层证据核查，全部由脚本强制执行：

| 层 | 命令 | 作用 |
|----|------|------|
| 1. 冲突检测 | `ev_manager add` 自动触发 | 新 EV 录入时检测与已有 EV 的 Contradict 关系 |
| 2. 覆盖率 | `ev_manager coverage` | 文献结论句中有 `[EV-xxx]` 的比例 ≥ 80% |
| 3. 忠实度 | `ev_manager audit` | `claim_text` 是否忠实于 `original_text`（faithful / drifted / unsupported） |
| 4. 句-原文匹配 | `ev_manager verify-report` | report.md 实际句子回写 `report_sentence`，检出幽灵 EV 和空 claim |
| 5. 假设三色核查 | `ev_manager mark-hypothesis` + `check-hypothesis` | 假设章节每条 EV 标 🟢/🟡/🔴，有误句自动替换并同步写回 evidence.json |

🟡/🔴 的原始错误句保存在 `hypothesis_audit.original_*` 字段（永不覆盖），修正后的内容更新到 `claim_text` / `report_sentence` / `audit_result`。

**双流同行评审（S8，强制）**：4 位标准评审（主题专家 / 方法专家 / 写作审稿人 / 领域外视角）独立评分，加上 Devil's Advocate 主动寻找逻辑漏洞与竞争性解释。DA-CRITICAL 项阻断评审门。

### 验收门

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

### 执行层脚本

验收门从文字要求升级为脚本强制计算，门控结果持久化，跨会话可恢复：

```
scripts/
├── init_project.py        # 初始化项目文件结构（新项目必须通过此脚本启动）
├── gate_check.py          # 计算门控条件，PASS/FAIL 写入 pipeline_state.json
├── ev_manager.py          # 管理 evidence.json（全部证据检查命令，见下）
├── evidence_memory.py     # 构建可查询证据缓存，检测 Contradict 冲突关系
├── passport.py            # SHA256 内容哈希 + 物料护照验证（跨会话完整性）
├── session_restore.py     # 跨会话状态恢复卡片
├── init_outreach.py       # 初始化套磁项目目录结构
├── outreach_manager.py    # 联系人 CRUD + 调研笔记 + 流言板 + 状态追踪
├── outreach_gate_check.py # 邮件 G3 质量门（5 项检查）
└── linkedin_scraper.py    # Bright Data LinkedIn API 封装（无 Token 时优雅跳过）
```

**ev_manager.py 命令速查**：

```bash
# ── 录入与查询 ──────────────────────────────────────────────────────────────
python scripts/ev_manager.py <slug> add \
  --paper-id 2310.08560 --original "原文..." --confidence high
python scripts/ev_manager.py <slug> list

# ── 覆盖率 / MATERIAL GAP ──────────────────────────────────────────────────
python scripts/ev_manager.py <slug> coverage   state/projects/<slug>/report.md
python scripts/ev_manager.py <slug> gap-count  state/projects/<slug>/report.md

# ── 引用忠实度审计（S7）─────────────────────────────────────────────────────
python scripts/ev_manager.py <slug> audit EV-001 faithful
python scripts/ev_manager.py <slug> audit EV-002 drifted --note "问题|修改建议"

# ── Report 句-原文直接匹配（S7 Step 3.6）────────────────────────────────────
# 提取 report.md 每条 [EV-xxx] 实际句子 → 写回 report_sentence，检出幽灵 EV
python scripts/ev_manager.py <slug> verify-report state/projects/<slug>/report.md

# ── 假设三色核查（S7 Step 3.7）──────────────────────────────────────────────
# Step A: 列出假设章节所有待审 EV（假设句 vs 原文并排）
python scripts/ev_manager.py <slug> check-hypothesis state/projects/<slug>/report.md

# Step B: 逐条标记（原始错误记录永久保存在 hypothesis_audit 块）
python scripts/ev_manager.py <slug> mark-hypothesis EV-007 yellow \
  --sentence "原始假设句" --discrepancy "问题说明" --corrected "修正后的句子"

# Step C: 写入颜色 + 替换错误句 + 同步更新 evidence.json
python scripts/ev_manager.py <slug> check-hypothesis state/projects/<slug>/report.md --apply

# ── 会话恢复 ─────────────────────────────────────────────────────────────────
python scripts/session_restore.py <slug>
```

所有脚本仅依赖 Python 3.9+ stdlib，无需额外安装。

### 套磁流水线

端到端教授联系工作流，覆盖调研 → 画像匹配 → 邮件起草 → 质量门控：

```
用户说"套磁 / cold email / 联系教授..."
  └─> O0  项目初始化（init_outreach.py → 录入教授信息）
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

**流言板（Rumor Board）**：10 种软信号来源，9 个相关维度（招生 / 导师风格 / 经费 / 课题组文化等），每条信号实时落盘。

**LinkedIn 集成**（可选）：填写 Bright Data API Token 后自动抓取教授档案；无 Token 时自动退回 web_search 策略。

```bash
# 触发方式（在 @scientist 对话中输入任意套磁关键词即可）
@scientist 帮我给 MIT 的 Prof. X 写套磁邮件
```

### MCP 工具层

通过 OpenClaw MCP 协议对接本地与云端计算服务，配置写入 `~/.openclaw/openclaw.json`：

| MCP Server | 用途 |
|------------|------|
| `math` | 本地统计计算（scipy/sympy）— 精确数值 |
| `wolfram` | Wolfram Alpha LLM API — 自然语言数学/物理问题 |

---

## 安装

### 前提条件

- [OpenClaw](https://openclaw.ai) 已安装
- Python 3.9+（执行层脚本、PPT 生成、HTML 导出）
- Node.js 18+（DeepClaw UI）
- （可选）Semantic Scholar API Key：https://api.semanticscholar.org/api-docs/

### 一键安装（推荐）

```bash
git clone https://github.com/YihangHu2004/openclaw-deepscientist.git
cd openclaw-deepscientist
bash install.sh
```

### 手动安装

```bash
# 1. 将 workspace/ 内容复制到 ~/.openclaw/workspace-scientist/
mkdir -p ~/.openclaw/workspace-scientist
cp -r . ~/.openclaw/workspace-scientist/

# 2. 填写个人配置
cp USER_CONFIG.example.md ~/.openclaw/workspace-scientist/USER_CONFIG.md

# 3. 在 ~/.openclaw/openclaw.json 的 agents.list 中添加：
# { "id": "scientist", "model": "deepseek/deepseek-v4-pro",
#   "workspace": "~/.openclaw/workspace-scientist" }

# 4. 安装 Python 依赖
pip install trafilatura python-pptx markdown numpy scipy sympy

# 5. 安装 DeepClaw UI 依赖
cd deepclaw-ui/server && npm install && cd ..
cd deepclaw-ui/client && npm install && cd ..
```

### 更新框架

```bash
git pull
bash install.sh --update
```

`--update` 模式覆盖所有框架文件（`SCIENTIST.md`、`skills/`、`pipelines/`、`scripts/`、`deepclaw-ui/`），**不会触碰** `USER_CONFIG.md`、`USER_PROFILE.md`、`MEMORY.md`、`state/` 中的个人数据。

---

## 配置

安装完成后，编辑以下两个配置文件（均已 gitignore，不会上传）：

**`USER_CONFIG.md`**（必填）：
```markdown
## 用户信息
- 称呼: 你的昵称
- 邮箱: your-email@example.com   ← 用于 Unpaywall 全文 API（必填）
- 机构: 你的学校 / 单位

## API Keys（可选）
- Semantic Scholar Key: xxx      ← 有则限流更少
- Bright Data API Token: xxx     ← 用于 LinkedIn 套磁调研（无则退回 web_search）
```

**`USER_PROFILE.md`**（套磁功能必填）：
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

重启 OpenClaw 后，在对话框输入 `@scientist` 切换到 DeepClaw：

```
@scientist 帮我研究 Chain-of-Thought Reasoning 的最新进展
```

DeepClaw 会询问运行模式（AUTO / INTERACTIVE），然后开始文献搜索。

**质量评审**（S6 完成后自动进入）：
```
@scientist 审计报告中的引用是否忠实原文       → S7（claim-auditor，强制）
@scientist 对报告进行同行评审                → S8（paper-reviewer，full 模式，强制）
@scientist 快速扫描报告漏洞                  → S8（quick 模式，仅 DA，10 分钟内）
@scientist 生成开题报告 PPT                  → S9（science-slides，可选）
```

---

## DeepClaw UI

现代化对话界面，运行在端口 **19000**：

```
Browser ──► DeepClaw UI (:19000) ──► OpenClaw Gateway (:18789)
```

代理服务器持有设备密钥，完成 Ed25519 签名认证后代表浏览器访问网关，浏览器无需接触 token。

**前提条件**：已完成 OpenClaw 设备配对（`~/.openclaw/identity/device.json` 存在）且网关正在运行。

**启动**：

```bash
cd ~/.openclaw/workspace-scientist/deepclaw-ui
.\install.ps1          # Windows
bash install.sh        # Mac/Linux
```

打开 **http://127.0.0.1:19000**。详见 [deepclaw-ui/README.md](deepclaw-ui/README.md)。

---

## 数据隐私

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
- **数学计算 MCP**: scipy + sympy + Wolfram Alpha LLM API
- **DeepClaw UI**: Next.js 15 + React 19 + Tailwind CSS + Node.js 代理服务器

---

## License

MIT
