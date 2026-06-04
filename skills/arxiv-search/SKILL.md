# Skill 1：arxiv-search — arXiv 深度搜索

**触发**：用户给出研究主题需要找论文；跟踪某方向最新进展；查某作者近作。

**不适用**：全文阅读（→ paper-reader）；引用分析（→ semantic-scholar）。

---

## Trajectory Memory Protocol

Before executing this skill, follow `skills/trajectory-memory/SKILL.md`: read
`trajectory_context.md` and recent `trajectory_memory.jsonl` as workflow prior.
After meaningful search actions or query strategy decisions, append a
`S1_ArxivSearch` trajectory record. Do not treat trajectory memory as evidence.

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

**Step 1：三层 Ladder 搜索**（顺序执行，⚠️ 严禁并行，每次间隔 ≥ 3 秒）

按以下三层依次展开，每层 top-k(20) 保底：

| 层 | 目标 | 查询方向 |
|----|------|---------|
| Layer 1 直接邻域 | 同 task / dataset / metric | 主题关键词 + 数据集名 + 指标名 |
| Layer 2 机制邻域 | 同方法 / 架构 / 目标函数 | 方法名 + 技术术语 + 模型类型 |
| Layer 3 瓶颈邻域 | 同 failure mode / 边界条件 | limitations + challenges + 对比关键词 |

每层至少执行 1 次查询，关键词覆盖不足时可在同层内追加查询。

API 调用：
1. `web_fetch` 获取 Atom XML，解析 `<id>` / `<title>` / `<author>` / `<published>` / `<summary>`
2. 写入 search_cache.json（key = SHA1(query + "\n" + max_results)[:12]）

**429 三级降级链**（按顺序尝试，前级恢复后不强制切回）：

| 级别 | 触发条件 | 方案 |
|------|---------|------|
| **Fallback 1** | arXiv API 首次 429 | 等待 30 秒，线性退避重试最多 5 次（30→60→90→120→150s） |
| **Fallback 2** | 5 次重试全部失败 | 改用 Semantic Scholar MCP `search_papers(query, limit=20)`，从返回结果中提取 arXiv ID，再用 `web_fetch arxiv.org/abs/{id}` 取摘要和元数据 |
| **Fallback 3** | S2 MCP 也不可用 | `web_search "arxiv {关键词} {年份}"` 获取 arXiv ID 列表，再逐条 `web_fetch arxiv.org/abs/{id}`（⚠️ 每次间隔 ≥ 5 秒） |
| **Fallback 4** | 以上全部失败 | `web_fetch "https://arxiv.org/search/?query={关键词}&searchtype=all"` 直接抓搜索页面（非 API 路径，不受 API 限速影响） |

> 💡 关键：`arxiv.org/abs/`、`arxiv.org/html/`、`arxiv.org/search/` 是**页面路径**，与 `export.arxiv.org` API 限速独立，API 429 不影响页面访问。

**Step 2：异议文献搜索**（必须额外执行一次，独立于三层 Ladder）
- 查询模板：`"challenges to {主题}"` / `"limitations of {方法}"` / `"criticism of {假设}"`
- 异议论文不精读，只提取核心反驳观点（摘要级），写入 project.md「研究局限性讨论」节

**Step 3：Triage 评分**（每篇论文标注分数 + dimension_tag）

**⚠️ S1 阶段质量分标 `pending`，等 S2 补充真实引用数后统一打分（unified_triage）。**

| 维度 | 评分 | 标准 |
|------|------|------|
| 主题相关性 | 1-3 | 1=边缘 / 2=方法/机制相关 / 3=直接相关（同主题+方法） |
| 文献质量 | pending | S2 补充 citationCount 后回填 |
| 全文可访问性 | 1-2 | 预检：`web_fetch /html/{id}` 返回 200→2 / 404→检查 PDF→仍无→1 |
| 贡献类型加权 | ×1.0-1.5 | 奠基性×1.5 / 最新方法×1.2 / 实验对比×1.0 / 综述×0.8 |

**dimension_tag（必填，至少一项，否则直接 skip）**：

| 标签 | 含义 |
|------|------|
| `seminal` | 奠基性论文，范式转折点 |
| `sota` | 当前最优方法 |
| `method_{类别}` | 某一方法流派的代表（如 method_transformer） |
| `challenge` | 异议 / 挑战 / failure mode 分析 |
| `recent` | 近 2 年新进展 |
| `none` | 不属于以上任何维度 → 直接 skip |

Triage 结果写入 search_cache.json：`triage_score` / `triage_tier=pending` / `dimension_tag` / `accessible` / `source_type`。

**Step 4：搜索停止信号**

满足以下**维度覆盖条件**才停止，否则针对缺口层补搜（不重搜全部）：

```
✓ seminal     ≥ 1 篇已找到
✓ sota        ≥ 1 篇已找到
✓ method_*    已识别 ≥ 2 个不同方法流派，各有代表论文
✓ challenge   ≥ 1 篇已找到
✓ recent      ≥ 1 篇已找到（发表 ≤ 2 年）
```

维度缺口 → 在对应 Layer 内追加查询，不重启全部搜索。
所有维度满足且追加查询不再带来新维度论文 → 停止。

**Step 5：输出与更新**

输出格式：
```markdown
## 搜索结果：{query}（共 N 篇，priority N 篇，backup N 篇）
| # | arXiv ID | 标题 | 年份 | Layer | dimension_tag | 可访问 |
|---|---------|------|------|-------|--------------|--------|
```

维度覆盖状态：
```
seminal  ✓/✗  sota  ✓/✗  method  ✓/✗（N 个流派）  challenge  ✓/✗  recent  ✓/✗
```

更新 TODO.md：`- [x] 文献搜索：{query}（维度覆盖 N/5，priority N 篇）`

写入 SUMMARY.md（追加）：
```markdown
## 阶段 1-2 摘要 · {日期}
- 搜索层：Layer1 N 篇 / Layer2 N 篇 / Layer3 N 篇 / 异议 N 篇
- 总候选：N 篇 | triage pending: N 篇 | skip: N 篇
- 维度覆盖：seminal ✓/✗ · sota ✓/✗ · method N派 · challenge ✓/✗ · recent ✓/✗
- 异议文献：{N 条核心反驳点}
```

---

## 验收门：文献覆盖门（Skill 1+2 完成后检查）

| 条件 | 要求 |
|------|------|
| 维度覆盖 | seminal / sota / challenge / recent 各 ≥ 1 篇，method 流派 ≥ 2 个 |
| 候选总量 | ≥ 10 篇（含 pending triage） |
| 缓存写入 | search_cache.json 已更新，所有论文有 dimension_tag |
| 异议文献 | ≥ 1 篇异议/挑战论文摘要已记录 |
| unified_triage | S2 完成后已回填质量分，triage_tier 无 pending |

---

## 执行步骤（强制）

完成本阶段内容后，按顺序执行：

```bash
# 1. 签署物料护照（search_cache.json 是本阶段主要产出）
python scripts/passport.py <slug> sign state/projects/<slug>/search_cache.json 1

# 2. 门控检查在 S2 完成后统一执行（含 unified_triage）
#    S2 结束时运行：python scripts/gate_check.py <slug> 2
```

- PASS → 更新 TODO.md `[x] 阶段 1+2：文献搜索`，自动进入 S3
- FAIL → 展示缺失项，针对缺口维度补搜，不重启全部搜索
