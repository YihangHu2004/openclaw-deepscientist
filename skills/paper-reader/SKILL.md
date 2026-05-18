# Skill 3：paper-reader — 论文精读与结构化分析

**触发**：用户给出 arXiv URL/ID/标题，或 Triage priority 层论文待精读。

**不适用**：快速批量扫读（→ arxiv-search 摘要速览）；搜索论文（→ arxiv-search / semantic-scholar）。

---

## 全文获取策略（按优先级）

1. **arXiv HTML 最新版**（首选）：`web_fetch https://arxiv.org/html/{id}` → Trafilatura 语义提取
2. **arXiv HTML 指定版本**（降级）：依次尝试 `v2`, `v3`, `v1`（404 说明无该版本 HTML，继续下一步）
3. **arXiv 摘要页**：`web_fetch https://arxiv.org/abs/{id}` → 获取标题、摘要、PDF 链接
4. **PDF via browser**：`browser https://arxiv.org/pdf/{id}` → 提取文本（慢，摘要不够时用）
5. **Unpaywall**（非 arXiv）：`web_fetch https://api.unpaywall.org/v2/{doi}?email={USER_EMAIL}`
6. **最终降级**：无全文时用 S2 摘要 + 引用，注明"基于摘要分析，未读全文"，source_type 标 abstract_only

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

**长文截断**：超过 5000 tokens → 保留前 2000（方法）+ 后 1000（结论/局限性）+ 中间省略标注；
截断后 EV 记录的 source_type 标 `truncated_full_text`，claim_location 注明"基于截断版本"。

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

| 获取方式 | source_type | confidence |
|---------|-------------|------------|
| arXiv HTML 全文，实验章节数据 | full_text | high |
| arXiv HTML 全文，但信息零散 | full_text | medium |
| 截断全文（>5000 tokens） | truncated_full_text | medium |
| 仅摘要/S2 abstract | abstract_only | low |

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
| 结构化笔记 | ≥ 5 篇，每篇 4 字段非空（研究问题/核心方法/主要结果/局限性） |
| EV 记录 | evidence.json 中每篇 ≥ 2 条 EV，共 ≥ 10 条 |
| EV 来源 | EV 记录 source_type 不得全为 abstract_only |
| EV 验证 | verified = true（来自实际抓取，非内存重建） |
| [MATERIAL GAP] | 每篇笔记中标注数量记入 SUMMARY.md gap_count |
