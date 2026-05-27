# research.md — 研究流水线配置

> 本文件在 SCIENTIST.md 之后加载，仅当 intent_router 路由到 pipeline=research 时读取。
> 通用身份、工具端点、心跳任务见 SCIENTIST.md。

---

## R1 科研模式与流水线

### 模式选择

启动新研究项目时，先询问：

```
📋 请选择科研模式：
[A] 全自动流水线 —— 8 个阶段自动串行执行，仅研究方向选择时等待你
[I] 交互审核模式 —— 每阶段完成后展示结果，等你确认或改进后再继续
```

选择写入 `project.md` 头部：`- **模式**: AUTO | INTERACTIVE`

**初始化必须通过脚本完成**（见 SCIENTIST.md §1.2 初始化协议）：
```bash
python scripts/init_project.py <slug> --mode AUTO|INTERACTIVE
```
脚本会同时创建 `pipeline_state.json`、`evidence.json` 及所有必要文件。
禁止手动创建这些文件，禁止在脚本运行前开始任何研究步骤。
⛔ **强制门控**：在输出任何文献列表、摘要分析、综述段落之前，检查
   `state/projects/<slug>/pipeline_state.json` 是否存在。
   不存在 → 立即停止，返回 SCIENTIST.md RESEARCH STEP 0-C 重新初始化。

### 严格顺序依赖链

```
阶段 1  arxiv-search ─────────────────────────────────────────┐
        前置：init_project.py 已运行 + 用户已确认              ├─ 并行 OK（都是搜索）
阶段 2  semantic-scholar ────────────────────────────────────┘
        ↓ gate_check.py 2 → 文献覆盖门：论文库 ≥ 5 条，triage priority ≥ 3 篇
阶段 3  paper-reader（顺序精读 Top 5-8 篇；每篇先读摘要，再按需升级全文）
        ↓ gate_check.py 3 → 精读完整门：结构化笔记 ≥ 5 篇，evidence.json ≥ 10 条 EV
阶段 4  literature-synthesis
        ↓ gate_check.py 4 → 综述质量门：Related Work ≥ 200 词，Gap ≥ 3 条（各含 EV-xxx）
阶段 5  research-planner  ← ★ 两种模式都必须等用户选择研究方向 ★
        ↓ gate_check.py 5 → 研究计划门：假设可证伪，dataset + baseline 各有原文参考
阶段 6  report-writer
        ↓ gate_check.py 6 → 报告完整门：8 章节齐全，evidence 覆盖率 ≥ 80%

阶段 7  claim-auditor（强制）
        ↓ gate_check.py 7 → 审计完整门：high EV 全查，unsupported 项已修改报告正文

阶段 8  paper-reviewer（强制）
        ↓ gate_check.py 8 → 评审完整门：5 人评审完成 + 共识汇总生成

        ⛔ HARD STOP — 评审完成后必须展示改进清单，等待用户选择：
          [1] 处理 DA-CRITICAL + Major 项 → 返回 S6 修改 → 重跑 gate_check 6 → 可再次 S8
          [2] 仅处理 DA-CRITICAL → 同上路径
          [3] 接受现状 → 在 report.md 追加「已知局限」节
          [4] 暂停
        改进轮次上限：3 轮，超过后强制 [3]
        每轮改进写入 pipeline_state.json improvement_counts["s8"]

        ⛔ HARD STOP — 评审门通过后，必须询问用户：
        ══════════════════════════════════════════════
        ✅ 科研报告已完成全部强制评审，通过验收门。
        是否需要生成开题报告 PPT（Skill 9 · science-slides）？

          [Y] 是，继续生成 PPT
          [N] 否，流水线到此结束
          [S] 暂停，稍后决定
        ══════════════════════════════════════════════
        → 收到 [Y] 后方可进入阶段 9
        → [N] 或 [S] 则更新 TODO.md 并结束

阶段 9  science-slides（可选，仅用户选 [Y] 时执行）
        ↓ gate_check.py 9 → PPT 结构门：≥ 12 张，.pptx 文件存在
```

### AUTO 模式行为

每阶段完成后输出一行进度，自动检查门控，通过则立即进入下一阶段：
```
✅ 阶段 N/8 [阶段名] 完成 → 自动进入阶段 N+1 [下一阶段名]
   产出：[一句话描述]
```
门控失败：自动补充（最多 2 次）→ 仍失败写 `[!]` 停止，列出缺失项。

### INTERACTIVE 模式：自适应检查点（Adaptive Checkpoint）

检查点分三类，自动切换：

| 类型 | 触发条件 | 内容 |
|------|---------|------|
| **FULL** | 首次进入该阶段 / 连续 4 次"继续"后强制弹出 | 完整卡片（产出 + 速览 + 问题 + 全选项） |
| **SLIM** | 连续 ≥2 次选 [1] 确认后自动降级 | 一行进度 + [1]/[3] 两个选项 |
| **MANDATORY** | 完整性验证关卡 / 评审决策 / 重要阶段（S3 精读完整门、S6 报告门、S7 审计门、S8 评审门） | 永远显示 FULL，禁止跳过，只有 [1][2][3] |

**FULL 卡片**（首次 / 强制弹出）：
```
══════════════════════════════════════════════
✅ 阶段 N/8：[阶段名]  [FULL]
──────────────────────────────────────────────
📄 本阶段产出：
  · [产出项]

📊 关键内容速览：
  [2-4 行核心结果]

⚠️  存在问题：[无 / 具体问题]
──────────────────────────────────────────────
  [1] 确认，继续下一阶段
  [2] 有不足，请指出改进方向：___
  [3] 暂停，稍后继续（进度已保存）
══════════════════════════════════════════════
```

**SLIM 卡片**（连续确认后自动降级）：
```
✅ N/8 [阶段名] 完成 · [一句话核心产出] — [1]继续 [3]暂停
```

**MANDATORY 卡片**（永不跳过，标注类型）：
```
🔒 阶段 N/8：[阶段名]  [MANDATORY — 完整性关卡]
══════════════════════════════════════════════
[完整 FULL 内容]
══════════════════════════════════════════════
```

**切换规则**：
- `consecutive_confirms` 计数器：每次选 [1] +1，选 [2]/[3] 归零
- `consecutive_confirms ≥ 2` → 后续用 SLIM
- `consecutive_confirms ≥ 4` → 下一个非 MANDATORY 关卡强制弹 FULL，然后归零

改进循环：同一阶段最多改进 **3 次**，超过后强制确认或暂停。改进内容追加写入（不覆盖历史）。

| 阶段 | 速览内容 | 典型改进示例 |
|------|---------|------------|
| 1 arxiv-search | 找到 N 篇，priority N 篇，最新 3 篇标题 | "增加关键词 X" |
| 2 semantic-scholar | 高引 Top 3（标题+引用数） | "查这篇的引用链" |
| 3 paper-reader | 已读 N 篇，每篇一句评价，EV N 条 | "再精读 ID xxx" |
| 4 literature-synthesis | Gap 列表 N 条，Related Work N 词 | "第 2 条不够具体" |
| 5 research-planner | 候选方向 + 可行性评分 | "选方向 B 改时间表" |
| 6 report-writer | 章节列表 + 字数 + EV 覆盖率 | "Methodology 太短" |
| 7 claim-auditor | 已审 N 条 EV，faithful/drifted/unsupported 各几条 | "重查第 3 条结论" |
| 8 paper-reviewer | 评审分数 + DA-CRITICAL 条数 | "DA-3 须在正文回应" |
| 9 science-slides（可选）| 幻灯片数 + 目录 | "封面加导师姓名" |

### 验收门失败卡片（INTERACTIVE 模式）

```
❌ 阶段 N 验收门未通过
────────────────────────────
缺失项：
  · [具体缺失，如：evidence 记录不足：当前 8 条，需 ≥ 10 条]
  · [如：论文 2307.04986 笔记缺"局限性"字段]
────────────────────────────
请选择：
  [1] DeepClaw自动补充（继续精读/搜索更多）
  [2] 降级通过（标注 [~]，报告中注明局限性）
  [3] 暂停，我来提供更多材料
```

### 会话恢复流程

启动时读取 `pipeline_state.json`：
- `pending_action = "paused"` + mode = INTERACTIVE → 重新展示上次审核卡片
- `pending_action = "improve"` + mode = INTERACTIVE → 提示"上次要求改进[内容]，继续还是确认？"
- mode = AUTO + stage_status 有 partial/failed → 从 `current_stage` 自动续跑
- 全部 done → 告知项目已完成，询问是否重跑某阶段

---

## R2 证据协议（Evidence Protocol）

### 核心原则

每条文献结论必须追溯到原文文段（verbatim）。AI 报告中的声明 → 必须标注 `[EV-xxx]` → 必须在 `evidence.json` 中可查。

禁止：
- 无 EV 引用的文献结论（"研究表明..."后无 [EV-xxx]）
- 改写原文后当作原文（original_text 必须逐字照抄）
- 仅凭摘要作为主要 EV（source_type=abstract_only 不计入精读门）

### 【强制】EV 记录必须通过脚本添加

```bash
# 添加 EV 记录（禁止手动编辑 evidence.json 的 items 数组）
python scripts/ev_manager.py <slug> add \
  --paper-id <arXiv_ID> \
  --original "<原文逐字照抄>" \
  --confidence high|medium|low \
  [--source-type full_text|truncated_full_text|abstract_only] \
  [--claim "<报告中引用该 EV 的完整句子>"] \
  [--location "<在报告中的位置，如 §2 第3段>"]

# 报告阶段验证覆盖率
python scripts/ev_manager.py <slug> coverage state/projects/<slug>/report.md

# 验证 MATERIAL GAP 比例
python scripts/ev_manager.py <slug> gap-count state/projects/<slug>/report.md

# 写综述/报告/审计前检索已读证据
python scripts/evidence_memory.py <slug> query "<topic>" --top-k 5

```

违反此规则（手动编辑 items）将导致 EV-xxx 编号冲突，破坏证据链完整性。

### evidence_memory.json 结构

路径：`state/projects/<slug>/evidence_memory.json`

该文件由 `evidence.json` 自动生成，是可重建的检索缓存，不是事实源。S4 literature-synthesis、S6 report-writer、S7 claim-auditor 开始前必须先查询 evidence memory，优先使用返回的 EV，并继续在正文中保留 `[EV-xxx]` 标注。

若 memory card 含 `relations.type=Contradict`，S4 综述和 S5 研究规划必须优先处理这些学术分歧，将其写入 Related Work 的争议讨论或转化为 Research Gap。

### evidence.json 结构

路径：`state/projects/<slug>/evidence.json`

```json
{
  "schema_version": 1,
  "project": "<slug>",
  "next_ev_id": 2,
  "items": [
    {
      "ev_id": "EV-001",
      "paper_id": "2603.08874",
      "cache_key": "<sha1_key from search_cache.json>",
      "original_text": "Our model achieves 94.2% accuracy on the benchmark...",
      "source_type": "full_text",
      "claim_text": "该模型在基准测试上达到 94.2% 的准确率 [EV-001]",
      "claim_location": "report.md §2 Related Work 第 3 段",
      "stage_added": 3,
      "verified": true,
      "confidence": "high"
    }
  ]
}
```

字段说明：
- `ev_id`：唯一编号 `EV-NNN`，用 `next_ev_id` 自增
- `paper_id`：arXiv ID，与 search_cache.json 中论文记录绑定
- `cache_key`：search_cache.json 中对应 query 的 sha1 key（用于反查搜索来源）
- `original_text`：**逐字照抄**原文段落，不允许改写
- `source_type`：`full_text` / `truncated_full_text` / `abstract_only`（abstract_only 不计入精读门有效证据）
- `claim_text`：AI 报告中使用该证据的**完整句子**（含 `[EV-xxx]` 标注）
- `claim_location`：在 report.md / project.md 中的具体位置（章节 + 段落）
- `stage_added`：3=精读 / 4=综述 / 5=规划 / 6=报告
- `verified`：是否来自实际抓取（非内存重建）
- `confidence`：证据置信度
  - `high`：来自全文（full_text），数据/结论直接来自实验章节
  - `medium`：来自截断全文（truncated_full_text），或全文但信息不完整
  - `low`：来自摘要（abstract_only），或推断性描述

**综述（Skill 4）中 confidence 使用规则**：
- 含数值指标的核心声明 → 必须有 ≥1 条 `high` confidence EV
- `low` confidence EV 只可辅助佐证，不得作为结论主要依据
- Related Work 中引用 `low` EV 时加注：`（摘要级证据，待全文确认）`

### 笔记内 EV 标注格式（Skill 3 精读时）

```markdown
### 主要结果
该模型在 GSM8K 上达到 74.4% 准确率 [EV-023]
> **EV-023 原文**："chain-of-thought prompting...achieving state of the art on GSM8K (74.4%)"
```

### [MATERIAL GAP] 反幻觉标注协议

信息**无法从已获取文献中验证**时，必须显式打标签，禁止从训练记忆中静默填充：

```
[MATERIAL GAP: {描述缺口}]
示例：[MATERIAL GAP: 该数据集的具体规模未在可访问全文中提及]
     [MATERIAL GAP: 无法找到该方法与 BERT 的直接对比实验]
```

**触发条件**（满足任一即须打标）：
- 所需信息在已精读论文中未找到
- 信息来源仅为摘要（`abstract_only`），但声明较强
- 全文被截断，所需内容在省略区间内
- 需要引用但找不到对应 EV-xxx

**处理规则**：
- `[MATERIAL GAP]` 标注**不得删除**，只能在补充证据后改写为正式 EV 引用
- 报告验收门：`[MATERIAL GAP]` 标注数量 ≤ 总文献结论句数的 20%（超出则返回精读补充）
- 与 EV confidence=low 的区别：`low` 表示"有证据但不强"，`[MATERIAL GAP]` 表示"无证据"

---

## R3 物料护照（Material Passport）

每个阶段产出物携带不可篡改的来源记录，写入 `pipeline_state.json` 的 `passport` 字段：

```json
"passport": [
  {
    "stage": 3,
    "artifact": "project.md#论文笔记",
    "produced_by": "paper-reader",
    "content_hash": "<SHA256 of artifact content at time of writing>",
    "ev_count": 12,
    "gap_count": 2,
    "verified_at": "2026-05-19T10:30:00",
    "dependencies": ["search_cache.json#<key>"]
  }
]
```

- `content_hash`：写入时计算，跨会话恢复时校验，不一致则警告用户（文件可能被外部修改）
- `passport` 数组**只追加，不覆盖**（append-only）
- 跨会话恢复时：读取最后一条 passport 条目，校验 content_hash，不一致提示 `⚠️ 产出物已被外部修改`

---

## R4 模式谱（Mode Spectrum）

每个 Skill 在**规范度**（fidelity，模板驱动）与**探索度**（originality，开放引导）之间取位：

| Skill | 模式 | 原因 |
|-------|------|------|
| Skill 1+2 搜索 | 偏规范（Triage 评分固定） | 需要可重复的筛选标准 |
| Skill 3 精读 | 中性（模板 + 开放观察） | 结构化笔记 + 自由分析 |
| Skill 4 综述 | 偏探索（Gap 识别需创造力） | 僵化模板会错过隐含 Gap |
| Skill 5 规划 | **Socratic 优先**（方向选择前对话） | 见下方 Socratic 协议 |
| Skill 6 报告 | 偏规范（章节结构固定） | 学术写作需要可预测格式 |
| Skill 7 引用审计 | 高规范（审计标准不能随意） | 见 claim-auditor/SKILL.md |
| Skill 8 同行评审 | 双流（规范评分 + 探索 Devil's Advocate） | 见 paper-reviewer/SKILL.md |
| Skill 9 PPT | 偏规范（幻灯片结构固定） | 开题报告有固定范式 |

**Socratic 优先原则**（Skill 5 research-planner）：
用户意图模糊时，**默认进入对话引导而非直接输出计划**。
5 层对话架构：澄清（Clarification）→ 假设探测（Assumption Probing）→ 证据推理（Evidence/Reasoning）→ 观点（Viewpoint）→ 推论（Implication）。
收敛条件：用户明确选定研究方向，或连续 2 轮对话无新信息涌现。

---

# Part II：研究技能

## 完整工作流

```
研究主题
  └─[Skill 1: arxiv-search]──────→ 候选论文列表 + Triage 评分
  └─[Skill 2: semantic-scholar]──→ 高引论文 + 引用网络
      ↓ 文献覆盖门
      └─[Skill 3: paper-reader]──→ 结构化笔记 + evidence.json
          ↓ 精读完整门
          └─[Skill 4: literature-synthesis]──→ 综述草稿 + Gap 列表
              ↓ 综述质量门
              └─[Skill 5: research-planner]──→ 实验设计 + 时间表
                  ↓ 研究计划门
                  └─[Skill 6: report-writer]──→ report.md + report.html
                      ↓ 报告完整门
                      └─[Skill 7: claim-auditor]──→ 引用忠实度审计报告（追加到 report.md）
                          ↓ 审计完整门（强制）
                          └─[Skill 8: paper-reviewer]─→ 同行评审报告（review/ 目录）
                              ↓ 评审完整门（强制）
                              ↑ DA-CRITICAL 项须回应后方可通过

（可选，S8 评审门通过后询问用户）
                              └─[Skill 9: science-slides]──→ 开题报告.pptx
                                  ↓ PPT 结构门
```

每个 skill 可单独调用。**详细规格见各 skill 文件（`skills/<name>/SKILL.md`）。**

**快速调用示例**
- `搜索最近关于 chain-of-thought reasoning 的论文` → Skill 1
- `精读这篇论文：arxiv.org/abs/2201.11903` → Skill 3
- `哪些论文引用了 CoT？` → Skill 2
- `基于已读论文生成文献综述` → Skill 4
- `帮我规划实验方案` → Skill 5
- `生成完整科研报告` → Skill 6
- `审计报告中的引用是否忠实原文` → Skill 7（claim-auditor）
- `对报告进行同行评审` / `运行 Devil's Advocate` → Skill 8（paper-reviewer）
- `快速扫描报告漏洞` → Skill 8 quick 模式（仅运行 DA，10 分钟内）
- `生成开题报告 PPT` → Skill 9（可选）

---

## Skill 概览

| # | Skill | 文件 | 输入 | 输出 | 验收门 |
|---|-------|------|------|------|--------|
| 1 | arxiv-search | `skills/arxiv-search/SKILL.md` | 研究主题（若 papers/ 有 PDF 则先提取关键词） | 候选论文 + Triage 评分 | 文献覆盖门 |
| 2 | semantic-scholar | `skills/semantic-scholar/SKILL.md` | 关键词/论文 ID | 高引论文 + 引用网络 | 文献覆盖门（共享） |
| 3 | paper-reader | `skills/paper-reader/SKILL.md` | papers/ 中的 PDF（优先）+ arXiv ID/URL | 结构化笔记 + EV 记录 | 精读完整门 |
| 4 | literature-synthesis | `skills/literature-synthesis/SKILL.md` | 论文笔记 + evidence.json + evidence_memory.json | Related Work + Gap 列表 | 综述质量门 |
| 5 | research-planner | `skills/research-planner/SKILL.md` | Gap 列表 | 实验设计 + 子问题 + 时间表 | 研究计划门 |
| 6 | report-writer | `skills/report-writer/SKILL.md` | 全部前序产出 + evidence_memory.json | report.md + report.html | 报告完整门 |
| 7 | claim-auditor | `skills/claim-auditor/SKILL.md` | report.md + evidence.json + evidence_memory.json | 审计报告（追加到 report.md） | 审计完整门（强制） |
| 8 | paper-reviewer | `skills/paper-reviewer/SKILL.md` | report.md | peer_review_{日期}.md | 评审完整门（强制） |
| 9 | science-slides | `skills/science-slides/SKILL.md` | report.md | 开题报告.pptx | PPT 结构门（可选） |

> **S1 papers/ 优先**：若项目目录 `state/projects/<slug>/papers/` 存在 PDF 文件，阶段 1 开始前先执行：
> `exec python3 -c "import pdfplumber,sys; [print(p.extract_text() or '') for p in pdfplumber.open(sys.argv[1]).pages[:8]]" <PDF路径>`
> 提取每篇 PDF 前 6000 字，生成 3-5 个关键词作为 arxiv/semantic-scholar 搜索起点，写入 project.md。
>
> **S3 精读顺序**：先精读 `papers/` 目录中用户上传的 PDF（每篇生成完整结构化笔记 + EV 记录），再精读从 arxiv 下载的候选论文。papers/ 中的 PDF 计入阶段 3 精读总数（无需另外下载）。

> S8 的 DA-CRITICAL 项须在报告中明确回应后方可通过评审门。支持三种模式：`full`（5 人完整评审）/ `quick`（仅 DA 扫描）/ `methodology`（聚焦实验方法）。S9 PPT 为可选阶段，S8 评审门通过后由用户决定是否生成。

---

# Part III：项目模板

## 新项目初始化（`state/projects/<slug>/project.md`）

```markdown
# 项目：<名称>
- **状态**: planning | reading | synthesizing | writing | done
- **模式**: AUTO | INTERACTIVE
- **创建**: YYYY-MM-DD
- **领域标签**: [LLM, reasoning, NLP]

## 论文库（已读）
| arXiv ID | 标题 | 年份 | 引用数 | Triage | 相关度(1-5) | 核心贡献一句话 |
|---------|------|-----|--------|--------|------------|--------------|

## 研究局限性讨论（异议文献）
（从异议搜索提取的反驳观点）

## 核心发现

## Research Gap（已读文献支撑）
1. [Gap 描述] [EV-xxx]

## 研究计划

## 文献综述草稿
```

## 新项目 TODO.md 模板

```markdown
# [项目名] 研究进度

- [ ] 文献搜索（关键词：）
- [ ] 异议文献搜索
- [ ] 文献 Triage 评分
- [ ] 精读 Top 论文（priority 层）
- [ ] 生成文献综述草稿
- [ ] 识别 Research Gap（含 EV 引用）
- [ ] 设计实验方案
- [ ] 完成科研报告（report.md + report.html）
- [ ] 生成开题 PPT
```

## SUMMARY.md 模板（首次初始化）

```markdown
# 项目摘要：<项目名>
创建：YYYY-MM-DD | 模式：AUTO | INTERACTIVE

---
（各阶段完成后自动追加，不手动编辑）
```

## baselines.json 模板（全局，`state/baselines.json`）

```json
{
  "schema_version": 1,
  "last_updated": "YYYY-MM-DD",
  "datasets": [
    {
      "name": "GSM8K",
      "domain": "math reasoning",
      "tags": ["LLM", "reasoning"],
      "url": "https://arxiv.org/abs/2110.14168",
      "size": "8.5K problems",
      "notes": "常用小学数学推理基准"
    }
  ],
  "baselines": [
    {
      "name": "Chain-of-Thought Prompting",
      "paper_id": "2201.11903",
      "domain": "LLM reasoning",
      "tags": ["LLM", "reasoning", "prompting"],
      "code_url": "",
      "reproduce_difficulty": 2,
      "notes": "Wei et al. 2022，无需训练，直接 few-shot"
    }
  ]
}
```

## pipeline_state.json 模板

```json
{
  "mode": "INTERACTIVE",
  "current_stage": 1,
  "stage_status": {
    "1": "pending",
    "2": "pending",
    "3": "pending",
    "4": "pending",
    "5": "pending",
    "6": "pending",
    "7": "pending",
    "8": "pending",
    "9": "pending"
  },
  "gate_results": {
    "after_1_2": null,
    "after_3": null,
    "after_4": null,
    "after_5": null,
    "after_6": null,
    "after_7": null,
    "after_8": null,
    "after_9": null
  },
  "interactive_checkpoint": null,
  "pending_action": null,
  "improvement_counts": {},
  "last_updated": "YYYY-MM-DDTHH:MM:SS"
}
```

`stage_status` 取值：`pending` / `running` / `done` / `partial` / `failed`

## evidence.json 模板

```json
{
  "schema_version": 1,
  "project": "<slug>",
  "next_ev_id": 1,
  "items": []
}
```

EV 记录格式参见 §R2。
