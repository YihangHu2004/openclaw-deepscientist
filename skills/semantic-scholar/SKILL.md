# Skill 2：semantic-scholar — 引用网络分析

**触发**：找领域高引论文；追踪引用链；查作者完整列表；补充 arXiv 滞后的文献。

**调用方式（优先级）**：
1. **MCP 工具**（`semantic-scholar` server）— 优先使用，内置速率控制和 429 自动重试
2. **web_fetch 降级**：MCP 不可用时改用 `web_fetch https://api.semanticscholar.org/graph/v1/...`

---

## Trajectory Memory Protocol

Before executing this skill, follow `skills/trajectory-memory/SKILL.md`: read
`trajectory_context.md` and recent `trajectory_memory.jsonl` as workflow prior.
After meaningful citation-network, author, or paper lookup actions, append a
`S2_SemanticScholar` trajectory record. Do not treat trajectory memory as evidence.

## MCP 工具速查

| 功能 | MCP 调用 | 降级 web_fetch 端点 |
|------|---------|-------------------|
| 关键词搜索 | `search_papers(query="{kw}", limit=20)` | `/paper/search?query={kw}&fields=...&limit=20` |
| 论文详情 | `get_paper(paper_id="{arXiv_id}")` | `/paper/arXiv:{id}?fields=...` |
| 谁引用了它 | `get_citations(paper_id="{id}", limit=50)` | `/paper/{pid}/citations?fields=...&limit=50` |
| 它引用了谁 | `get_references(paper_id="{id}", limit=50)` | `/paper/{pid}/references?fields=...&limit=50` |
| 作者论文 | `get_author_papers(author_id="{aid}")` | `/author/{aid}/papers?fields=...&limit=50` |

**⚠️ 速率限制**：MCP server 内置速率控制（无 Key 时 3 秒间隔，有 Key 时 1.1 秒间隔）和 429 自动重试（等 20 秒重试一次）。
仍失败：改用 `web_search "site:semanticscholar.org {关键词}"`。
API Key 配置：`~/.openclaw/openclaw.json` → `mcp.servers.semantic-scholar.env.SEMANTIC_SCHOLAR_API_KEY`。

---

## 工作流

**Step 1：关键词搜索（同 S1 三层 Ladder）**

对 S1 的三层查询各补一次 Semantic Scholar 搜索（top-k 20），结果合并去重后写入 search_cache.json。

**Step 2：引用链扩展 + 阈值补充**

对 S1 已找到的所有 priority/pending 论文，展开双向引用链：

```
get_citations(paper_id, limit=50)   → 谁引用了它（后续工作）
get_references(paper_id, limit=50)  → 它引用了谁（基础工作）
```

遍历引用链结果时，按以下规则处理（新论文豁免：发表 ≤ 2 年不受引用阈值约束）：

| citationCount | 处理 |
|--------------|------|
| ≥ 200 | 直接加入 priority 池，标注 `source=citation_threshold`，跳过 unified_triage |
| ≥ 50 | 加入普通候选池，参与 unified_triage |
| < 50 且不在 top-k 内 | 忽略（除非发表 ≤ 2 年） |
| 发表 ≤ 2 年（任意引用数） | 加入候选池，参与 unified_triage |

**Step 3：为所有 S1 论文回填引用数**

对 search_cache.json 中所有 `triage_tier=pending` 的论文，调用 `get_paper()` 获取 `citationCount`，写回 `citation_count` 字段。

**Step 4：unified_triage（统一打分）**

S1 + S2 候选池合并去重后，统一执行一次 Triage：

质量分规则（使用真实 citationCount）：

| citationCount | 发表年份 | 质量分 |
|--------------|---------|--------|
| > 100 | 任意 | 3 |
| 20-100 | 任意 | 2 |
| < 20 | ≤ 2 年 | 2（新论文豁免） |
| < 20 | > 2 年 | 1 |
| 无数据 | 任意 | 1 |

总分 = 主题相关性(1-3) × 质量(1-3) × 可访问性(1-2) × 贡献类型加权(×0.8-1.5)
- ≥ 6 → **priority**
- 3-5 → **backup**
- < 3 → **skip**
- `citation_threshold` 来源 → 直接 **priority**，不参与计算

**dimension_tag**（S1 已标注的保留，S2 新增论文补标）：
`seminal` / `sota` / `method_{类别}` / `challenge` / `recent` / `none`（→ skip）

unified_triage 完成后，所有论文的 `triage_tier` 不再有 `pending`。

---

## 输出格式

```markdown
## Semantic Scholar + unified_triage 结果
| # | 标题 | 年份 | 引用数 | 来源 | Triage | dimension_tag |

### 维度覆盖状态
seminal ✓/✗ · sota ✓/✗ · method N派 · challenge ✓/✗ · recent ✓/✗

### 引用阈值补充
- citation ≥ 200 直接 priority：N 篇
- citation ≥ 50 加入候选池：N 篇
```

---

## 验收门：文献覆盖门（与 arxiv-search 合并检查）

见 `skills/arxiv-search/SKILL.md` 验收门。两个 Skill 共享同一道门，S2 完成 unified_triage 后统一检查。

---

## 执行步骤（强制）

完成本阶段内容后，按顺序执行：

```bash
# 1. 签署物料护照（search_cache.json 同时包含 S1+S2+unified_triage 结果）
python scripts/passport.py <slug> sign state/projects/<slug>/search_cache.json 2

# 2. 门控检查（S1+S2 合并，文献覆盖门）
python scripts/gate_check.py <slug> 2
```

- PASS → 更新 TODO.md `[x] 阶段 1+2：文献搜索`，进入 S3 paper-reader
- FAIL → 展示缺失项，针对缺口维度补搜
