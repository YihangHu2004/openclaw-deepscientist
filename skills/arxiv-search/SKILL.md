# Skill 1：arxiv-search — arXiv 深度搜索

**触发**：用户给出研究主题需要找论文；跟踪某方向最新进展；查某作者近作。

**不适用**：全文阅读（→ paper-reader）；引用分析（→ semantic-scholar）。

---

## 查询语法

| 需求 | 示例 |
|------|------|
| 按标题 | `ti:chain-of-thought` |
| 按摘要 | `abs:reasoning LLM` |
| 按作者 | `au:Wei Jason` |
| 按类别 | `cat:cs.CL` |
| 组合 | `ti:chain-of-thought AND cat:cs.CL` |

API URL 格式：
```
https://export.arxiv.org/api/query?search_query={query}&start=0&max_results=20&sortBy=submittedDate&sortOrder=descending
```

---

## 工作流

**Step 0：内存预查**
1. 检查 MEMORY.md 和 search_cache.json 中是否已有该主题的相关论文
2. 有缓存（24 小时内）→ 直接返回缓存，跳过 API 调用

**Step 1：搜索**（顺序执行，⚠️ 严禁并行，每次间隔 ≥ 3 秒）
1. `web_fetch` 获取 Atom XML，解析 `<id>` / `<title>` / `<author>` / `<published>` / `<summary>`
2. 429 处理：等待 10 秒重试一次；仍失败改用 `web_search`
3. 写入 search_cache.json（key = SHA1(query + "\n" + max_results)[:12]）

**Step 2：异议文献搜索**（必须额外执行一次）
- 查询模板：`"challenges to {主题}"` / `"limitations of {方法}"` / `"criticism of {假设}"`
- 异议论文不精读，只提取核心反驳观点（摘要级），写入 project.md「研究局限性讨论」节

**Step 3：Triage 评分**（每篇论文在进入 paper-reader 前打分）

| 维度 | 评分 | 标准 |
|------|------|------|
| 主题相关性 | 1-3 | 1=边缘 / 2=方法/机制相关 / 3=直接相关（同主题+方法） |
| 文献质量 | 1-3 | 1=预印本无引用 / 2=有引用或顶会接收 / 3=高引(>100)或顶会发表 |
| 全文可访问性 | 1-2 | 预检：`web_fetch /html/{id}` 返回 200→2 / 404→检查 PDF→仍无→1 |
| 贡献类型加权 | ×1.0-1.5 | 奠基性×1.5 / 最新方法×1.2 / 实验对比×1.0 / 综述×0.8 |

总分 = 主题 × 质量 × 可访问性 × 加权
- ≥ 6 → **priority**（进入 paper-reader）
- 3-5 → **backup**（摘要收录，容量有余时精读）
- < 3 → **skip**（只记录标题）

相关性判断准则——满足任一条为"相关"：
1. 直接研究相同主题/方法/场景
2. 揭示关键 limitation 或 failure mode
3. 提供方法论上可迁移的思路（即使 domain 不同）
4. 是该领域的 seminal paper 或范式转折点

Triage 结果写入 search_cache.json 对应论文的 `triage_score` / `triage_tier` / `accessible` / `source_type` 字段。

**Step 4：搜索停止信号**

满足以下全部条件才停止，否则调整关键词重新搜索：
```
① priority 层已有 ≥ 8 篇
② 找到 ≥ 1 篇奠基性论文（seminal）
③ 找到 ≥ 1 篇最新进展（过去 2 年）
④ 找到 ≥ 1 篇异议/挑战文献
```

**Step 5：输出与更新**

输出格式：
```markdown
## 搜索结果：{query}（共 N 篇，priority N 篇，backup N 篇）
| # | arXiv ID | 标题 | 年份 | 引用 | Triage | 可访问 |
|---|---------|------|------|------|--------|--------|
```

更新 TODO.md：`- [x] 文献搜索：{query}（priority N 篇，共 N 篇）`

写入 SUMMARY.md（追加）：
```markdown
## 阶段 1-2 摘要 · {日期}
- 搜索词：{关键词列表}
- 总候选：N 篇 | priority: N 篇 | backup: N 篇 | skip: N 篇
- 高引 Top 3：{标题（引用数）}
- 异议文献：{N 条核心反驳点}
```

---

## 验收门：文献覆盖门（Skill 1+2 完成后检查）

| 条件 | 要求 |
|------|------|
| 论文总量 | ≥ 5 篇含 arXiv ID + 标题 + 摘要 |
| priority 层 | ≥ 3 篇 triage_tier = priority |
| 高引论文 | ≥ 1 篇 citation_count > 50 |
| 缓存写入 | search_cache.json 已更新 |
| 异议文献 | ≥ 1 篇异议/挑战论文摘要已记录 |
