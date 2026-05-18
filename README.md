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

---

## 安装

### 前提条件

- [OpenClaw](https://openclaw.ai) 已安装
- Python 3.9+（用于 PPT 生成和 HTML 导出）
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
pip install trafilatura python-pptx markdown
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

---

## 版本

当前版本：**v0.6.0**（2026-05-19）

详见 [CHANGELOG.md](CHANGELOG.md)。

---

## License

MIT
