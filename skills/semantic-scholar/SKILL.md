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

## Triage 集成

S2 搜索结果也经过 Triage 评分（规则同 arxiv-search Step 3），结果合并到 search_cache.json。
S2 提供的 `citationCount` 直接用于文献质量评分（>100 引用 = 质量 3 分）。

---

## 输出格式

```markdown
## Semantic Scholar 结果：{query}
| # | 标题 | 作者 | 年份 | 引用数 | Triage |

### 引用网络摘要
- 被引用 M 次 / 引用 N 篇参考文献
- 重要后续工作：...
```

---

## 验收门：文献覆盖门（与 arxiv-search 合并检查）

见 `skills/arxiv-search/SKILL.md` 验收门。两个 Skill 共享同一道门，并行完成后统一检查。

---

## 执行步骤（强制）

完成本阶段内容后，按顺序执行：

```bash
# 1. 签署物料护照（search_cache.json 同时包含 S1+S2 结果）
python scripts/passport.py <slug> sign state/projects/<slug>/search_cache.json 2

# 2. 门控检查（S1+S2 合并，文献覆盖门）
python scripts/gate_check.py <slug> 2
```

- PASS → 更新 TODO.md `[x] 阶段 1+2：文献搜索`，进入 S3 paper-reader
- FAIL → 展示缺失项，执行 SCIENTIST.md §1.6 失败处理流程
