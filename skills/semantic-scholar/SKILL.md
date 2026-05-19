# Skill 2：semantic-scholar — 引用网络分析

**触发**：找领域高引论文；追踪引用链；查作者完整列表；补充 arXiv 滞后的文献。

**基础 URL**：`https://api.semanticscholar.org/graph/v1`（从 USER_CONFIG.md 读取 API Key）

---

## 端点速查

| 功能 | 端点 |
|------|------|
| 关键词搜索 | `/paper/search?query={kw}&fields=title,authors,year,citationCount,abstract,externalIds&limit=20` |
| 论文详情 | `/paper/arXiv:{id}?fields=title,abstract,authors,year,citationCount,references,citations` |
| 谁引用了它 | `/paper/{pid}/citations?fields=title,authors,year,citationCount&limit=50` |
| 它引用了谁 | `/paper/{pid}/references?fields=title,authors,year,citationCount&limit=50` |
| 作者论文 | `/author/{aid}/papers?fields=title,year,citationCount&limit=50&sort=citationCount` |

**⚠️ 速率限制**：无 API Key 时匿名配额低（每 5 分钟约 100 次）。
429 处理：等待 15 秒重试；仍失败改用 `web_search "site:semanticscholar.org {关键词}"`。
建议申请免费 Key：https://api.semanticscholar.org/api-docs/

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
