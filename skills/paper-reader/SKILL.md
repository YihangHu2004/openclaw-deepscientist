# Skill 3：paper-reader — 论文精读与结构化分析

**触发**：用户给出 arXiv URL/ID/标题，或 Triage priority 层论文待精读。

**不适用**：快速批量扫读（→ arxiv-search 摘要速览）；搜索论文（→ arxiv-search / semantic-scholar）。

## 精读选择策略

**目标**：覆盖领域全貌，不设固定数量上限，以维度覆盖为停止条件。

### 精读优先级排序

1. `citation_threshold` 来源（citation ≥ 200）的 priority 论文 → 最优先
2. `dimension_tag = seminal` 的 priority 论文 → 必读
3. `dimension_tag = sota` 的 priority 论文 → 必读
4. 每个 `method_*` 流派得分最高的 1-2 篇 → 必读
5. `dimension_tag = challenge` 的 priority 论文 → 必读
6. `dimension_tag = recent` 的 priority 论文 → 必读
7. 剩余 priority 论文按 Triage 分从高到低补充

### 精读停止条件（维度覆盖门）

满足以下全部条件才停止，否则继续读下一篇：

```
✓ seminal     ≥ 1 篇已精读
✓ sota        ≥ 1 篇已精读
✓ method_*    已识别的每个方法流派各 ≥ 1 篇已精读
✓ challenge   ≥ 1 篇已精读
✓ recent      ≥ 1 篇已精读
✓ 继续精读不再带来新维度或新方法流派的论文
```

维度有缺口 → 返回 S1/S2 针对缺口层补搜，补搜后继续精读。
所有维度满足 → 停止，不强制追加篇数。

---

## Trajectory Memory Protocol

Before executing this skill, follow `skills/trajectory-memory/SKILL.md`: read
`trajectory_context.md` and recent `trajectory_memory.jsonl` as workflow prior.
After meaningful paper-read, extraction, full-text escalation, or EV-writing
actions, append a `S3_PaperReader` trajectory record. Do not treat trajectory
memory as evidence.

## 获取策略：摘要先行，按需升级

**每篇论文必须先读摘要，再决定是否拉全文。禁止跳过摘要直接获取全文。**

### Step 0：摘要预读（必须，所有论文）

```
web_fetch https://arxiv.org/abs/{id}
```

获取：标题、摘要、作者、发表时间。本地 PDF（papers/ 目录）则用 pdfplumber 提取首页文字（限 1500 字）。

读完摘要后，按以下标准判断是否需要全文：

| 条件（满足任一） | 决策 |
|----------------|------|
| 需要具体实验数据、指标数值用于 EV 记录 | 升级全文 |
| 核心方法细节在摘要中未说明 | 升级全文 |
| 该论文是 priority 层且 Triage ≥ 6 | 升级全文 |
| 摘要已能支撑所需 EV（结论类、概述类） | 停留摘要，source_type=abstract_only |
| backup 层论文，主题相关但不是核心 | 停留摘要，source_type=abstract_only |

**摘要足够时不升级**——abstract_only 的 EV 可用于综述辅助引用，仅不计入精读门有效证据。

### Step 1：全文获取（仅 Step 0 判断需要时执行）

按优先级降级：

1. **arXiv HTML 最新版**：`web_fetch https://arxiv.org/html/{id}` → Trafilatura 语义提取
2. **arXiv HTML 指定版本**：依次尝试 `v2`, `v3`, `v1`
3. **PDF via browser**：`browser https://arxiv.org/pdf/{id}` → 提取文本（慢，摘要不够时用）
4. **Unpaywall**（非 arXiv）：`web_fetch https://api.unpaywall.org/v2/{doi}?email={USER_EMAIL}`
5. **最终降级**：全文不可达时保持 abstract_only，注明"基于摘要分析，未读全文"

**表格与图注专项提取**（Trafilatura 会丢弃 `<table>`，须单独处理）：
获取 arXiv HTML 后，额外用 BeautifulSoup 提取所有 `<table>` 元素，转为 Markdown 表格，追加到正文末尾：
```python
from bs4 import BeautifulSoup
soup = BeautifulSoup(html_text, 'html.parser')
for table in soup.find_all('table'):
    rows = [[td.get_text(strip=True) for td in tr.find_all(['td','th'])]
            for tr in table.find_all('tr')]
    # 转 Markdown 表格追加到提取文本后
```
同样提取 `<figcaption>` 图注（标题 + 位置说明）。
表格信息优先用于 literature-synthesis 的方法对比表；EV 引用表格数据时 claim_location 注明 "Table N"。

**长文处理**：按 token 数选择策略：

| 全文长度 | 策略 |
|---------|------|
| ≤ 30,000 tokens | 直接读全文，不截断 |
| > 30,000 tokens | **Map-Reduce 精读**（见下方） |

### Step 2：Map-Reduce 精读（仅全文 > 30,000 tokens 时触发）

**Map 阶段**：将全文按 8,000 tokens 切块（相邻块重叠 500 tokens 保持连贯），对每块独立提取：

```
── Chunk N/M ──────────────────────────────
核心主张：[该块中出现的可引用结论，逐条列出]
方法细节：[算法/模型/数据处理的具体描述]
实验数据：[指标数值、数据集名称、对比基线]
局限性：[作者明确承认的不足]
EV 候选：
  - "<原文逐字引用 1>"
  - "<原文逐字引用 2>"
───────────────────────────────────────────
```

每块处理完后**立即写入临时文件** `state/projects/<slug>/tmp_map_{id}_chunk{N}.md`，再处理下一块。禁止在内存中累积所有块后再写。

**Reduce 阶段**：读取所有 `tmp_map_*` 文件，执行：

1. **去重**：合并重复出现的主张和数据点（保留出现次数最多的原文版本）
2. **排序**：按重要性排列（实验数值 > 方法核心 > 背景描述）
3. **EV 筛选**：从所有 EV 候选中选取最强的 ≤ 10 条，调用 ev_manager.py 写入 evidence.json
4. **输出**：填写标准结构化笔记模板（研究问题 / 核心方法 / 实验设置 / 主要结果 / 局限性）

Reduce 完成后删除所有 `tmp_map_*` 临时文件。

Map-Reduce 处理的论文 EV 记录 source_type 标 `map_reduce_full_text`，confidence 视数据质量定（含数值 → high，无数值 → medium）。

---

## 反幻觉协议（Anti-Leakage）

精读时遇到**无法从当前文献中验证的信息**，必须打 `[MATERIAL GAP]` 标签，禁止从训练记忆静默填充：

```markdown
### 实验设置
- 数据集：SQuAD 2.0（10 万条问题） [EV-012]
- 基线方法：[MATERIAL GAP: 论文未说明使用了哪些 baseline，全文截断区间内]
- 评估指标：F1 / EM [EV-013]
```

**打标触发条件**：
- 该字段在可访问全文中找不到对应内容
- 全文被截断，所需内容在省略区间
- 只能从摘要推断，但推断较强

每篇笔记的 `[MATERIAL GAP]` 数量记录在 SUMMARY.md 阶段 3 摘要的 `gap_count` 字段。

---

## 证据提取（精读时同步写入 evidence.json）

每个关键发现/方法/指标提取一条 EV 记录，按获取方式设置 confidence：

| 获取方式 | source_type | confidence | 计入精读门 |
|---------|-------------|------------|-----------|
| arXiv HTML 全文，实验章节数据 | full_text | high | ✅ |
| arXiv HTML 全文，但信息零散 | full_text | medium | ✅ |
| Map-Reduce 全文（>30,000 tokens） | map_reduce_full_text | high/medium | ✅ |
| 摘要预读后判断不需升级 | abstract_only | low | ❌（辅助引用） |
| 全文不可达，强制降级 | abstract_only | low | ❌（辅助引用） |

每篇论文至少提取 **2 条** EV 记录（至少 1 条 confidence ≥ medium）。

---

## 结构化笔记模板

```markdown
## [论文英文原标题]
- **arXiv**: {id} | **发表**: {年月} | **来源**: {会议/期刊/预印本}
- **作者**: {主要作者} et al. | **引用数**: {N} | **Triage**: {priority/backup}

### 研究问题
### 核心方法
### 实验设置
- 数据集：/ 基线方法：/ 评估指标：
### 主要结果
[结论] [EV-xxx]
> **EV-xxx 原文**："..."
### 局限性
[局限] [EV-xxx]
### 与当前研究的关联
```

笔记追加到 `project.md` 论文库表格，更新 TODO.md：`- [x] 精读：{标题}（{id}）`

写入 SUMMARY.md（追加）：
```markdown
## 阶段 3 摘要 · {日期}
- 精读：N 篇（{标题列表，每篇一行 + 一句评价}）
- EV 记录：N 条（high: N / medium: N / low: N）
- 共识发现：{2-3 句核心洞察}
- 主要局限性：{2-3 条，含 EV 引用}
```

---

## 验收门：精读完整门

| 条件 | 要求 |
|------|------|
| 维度覆盖 | seminal / sota / challenge / recent 各 ≥ 1 篇精读，每个 method_* 流派 ≥ 1 篇精读 |
| 结构化笔记 | 每篇 4 字段非空（研究问题/核心方法/主要结果/局限性） |
| EV 记录 | evidence.json 中每篇 ≥ 2 条 EV，共 ≥ 10 条 |
| EV 来源 | EV 记录 source_type 不得全为 abstract_only |
| EV 验证 | verified = true（来自实际抓取，非内存重建） |
| [MATERIAL GAP] | 每篇笔记中标注数量记入 SUMMARY.md gap_count |

---

## 执行步骤（强制）

完成本阶段内容后，按顺序执行：

```bash
# 1. 签署物料护照（project.md 含所有精读笔记）
python scripts/passport.py <slug> sign state/projects/<slug>/project.md 3

# 2. 验证 EV 覆盖率（精读后应已添加 ≥10 条 EV）
python scripts/ev_manager.py <slug> list --stage 3

# 3. 门控检查（精读完整门）
python scripts/gate_check.py <slug> 3
```

- PASS → 更新 TODO.md `[x] 阶段 3：论文精读`，进入 S4 literature-synthesis
- FAIL → 展示缺失项，执行 SCIENTIST.md §1.6 失败处理流程（通常需补读论文或补 EV 记录）
