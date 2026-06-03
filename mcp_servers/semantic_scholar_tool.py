"""
Semantic Scholar MCP Server
===========================
Provides structured access to the Semantic Scholar Graph API v1.

Tools:
  search_papers     — keyword search with Triage-ready fields
  get_paper         — details for one paper (arXiv ID or SS paperId)
  get_citations     — papers that cite a given paper
  get_references    — papers cited by a given paper
  get_author_papers — all papers by an author, sorted by citation count

Rate limits (Semantic Scholar):
  - Without API key: ~100 req / 5 min (anonymous)
  - With API key:    ~1 req/s

Set env var SEMANTIC_SCHOLAR_API_KEY to your key; leave empty for anonymous.
"""

import os
import time
import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("semantic-scholar")

BASE = "https://api.semanticscholar.org/graph/v1"
_API_KEY = os.environ.get("SEMANTIC_SCHOLAR_API_KEY", "")
_LAST_REQ: float = 0.0
_MIN_INTERVAL = 1.1  # seconds between requests (keyed); 3s for anonymous


def _headers() -> dict:
    if _API_KEY:
        return {"x-api-key": _API_KEY}
    return {}


def _get(path: str, params: dict | None = None) -> dict:
    """Rate-limited GET with automatic retry on 429."""
    global _LAST_REQ
    interval = _MIN_INTERVAL if _API_KEY else 3.0
    wait = interval - (time.time() - _LAST_REQ)
    if wait > 0:
        time.sleep(wait)

    url = BASE + path
    try:
        r = httpx.get(url, params=params, headers=_headers(), timeout=15)
        _LAST_REQ = time.time()
        if r.status_code == 429:
            time.sleep(20)
            r = httpx.get(url, params=params, headers=_headers(), timeout=15)
            _LAST_REQ = time.time()
        r.raise_for_status()
        return r.json()
    except httpx.HTTPStatusError as e:
        return {"error": str(e), "status_code": e.response.status_code}
    except Exception as e:
        return {"error": str(e)}


def _fmt_authors(authors: list) -> str:
    names = [a.get("name", "") for a in (authors or [])]
    if len(names) <= 3:
        return ", ".join(names)
    return f"{names[0]} et al."


# ── Tools ──────────────────────────────────────────────────────────────────────

@mcp.tool()
async def search_papers(
    query: str,
    limit: int = 20,
    fields: str = "title,authors,year,citationCount,abstract,externalIds,openAccessPdf",
) -> str:
    """
    Search Semantic Scholar by keyword.

    Returns a Markdown table with title, authors, year, citations, arXiv ID,
    and a truncated abstract — ready for Triage scoring.

    Args:
        query: Search query string (e.g. "chain-of-thought reasoning LLM")
        limit: Max results (default 20, max 100)
        fields: Comma-separated API fields to fetch
    """
    data = _get("/paper/search", {"query": query, "fields": fields, "limit": limit})
    if "error" in data:
        return f"❌ API error: {data['error']}"

    papers = data.get("data", [])
    if not papers:
        return f"No results for: {query}"

    lines = [
        f"## Semantic Scholar 搜索结果：{query}",
        f"共 {data.get('total', '?')} 篇，返回前 {len(papers)} 篇\n",
        "| # | 标题 | 作者 | 年份 | 引用数 | arXiv ID |",
        "|---|------|------|------|--------|----------|",
    ]
    for i, p in enumerate(papers, 1):
        arxiv_id = (p.get("externalIds") or {}).get("ArXiv", "—")
        title = (p.get("title") or "").replace("|", "/")[:80]
        authors = _fmt_authors(p.get("authors", []))
        year = p.get("year") or "—"
        cites = p.get("citationCount", 0)
        lines.append(f"| {i} | {title} | {authors} | {year} | {cites} | {arxiv_id} |")

    lines.append("\n### 摘要速览")
    for i, p in enumerate(papers[:5], 1):
        abstract = (p.get("abstract") or "（无摘要）")[:200]
        lines.append(f"\n**{i}. {p.get('title','')[:70]}**")
        lines.append(f"> {abstract}…")

    return "\n".join(lines)


@mcp.tool()
async def get_paper(
    paper_id: str,
    fields: str = "title,abstract,authors,year,citationCount,references,citations,externalIds,openAccessPdf",
) -> str:
    """
    Fetch full details for one paper.

    Args:
        paper_id: arXiv ID (e.g. "2201.11903") OR Semantic Scholar paperId
                  OR DOI. arXiv IDs are auto-prefixed with "arXiv:".
        fields:   Comma-separated fields to fetch
    """
    # Auto-detect format
    if paper_id.startswith("10."):
        pid = paper_id  # DOI
    elif not paper_id.startswith("arXiv:") and not len(paper_id) == 40:
        pid = f"arXiv:{paper_id}"
    else:
        pid = paper_id

    data = _get(f"/paper/{pid}", {"fields": fields})
    if "error" in data:
        return f"❌ API error: {data['error']}"

    title = data.get("title", "Unknown")
    authors = _fmt_authors(data.get("authors", []))
    year = data.get("year", "—")
    cites = data.get("citationCount", 0)
    abstract = (data.get("abstract") or "（无摘要）")[:600]
    arxiv_id = (data.get("externalIds") or {}).get("ArXiv", "—")
    pdf = (data.get("openAccessPdf") or {}).get("url", "—")

    ref_count = len(data.get("references") or [])
    cite_count = len(data.get("citations") or [])

    lines = [
        f"## {title}",
        f"- **作者**: {authors}  **年份**: {year}  **引用数**: {cites}",
        f"- **arXiv**: {arxiv_id}  **PDF**: {pdf}",
        f"- **引用网络**: 被引 {cites} 次 / 参考文献 {ref_count} 篇 / 已索引后续引用 {cite_count} 篇",
        f"\n### 摘要\n{abstract}",
    ]

    top_cites = sorted(
        data.get("citations") or [], key=lambda x: x.get("citationCount", 0), reverse=True
    )[:5]
    if top_cites:
        lines.append("\n### 高引后续工作（Top 5）")
        for c in top_cites:
            cp = c.get("citingPaper", c)
            lines.append(
                f"- {cp.get('title','?')[:70]} "
                f"({cp.get('year','?')}, {cp.get('citationCount',0)} 引用)"
            )

    return "\n".join(lines)


@mcp.tool()
async def get_citations(
    paper_id: str,
    limit: int = 50,
) -> str:
    """
    List papers that CITE the given paper (forward citations).

    Args:
        paper_id: arXiv ID or Semantic Scholar paperId
        limit:    Max results (default 50)
    """
    if not paper_id.startswith("arXiv:") and not len(paper_id) == 40:
        pid = f"arXiv:{paper_id}"
    else:
        pid = paper_id

    fields = "title,authors,year,citationCount"
    data = _get(f"/paper/{pid}/citations", {"fields": fields, "limit": limit})
    if "error" in data:
        return f"❌ API error: {data['error']}"

    items = data.get("data", [])
    lines = [
        f"## 引用此论文的文章（共检索 {len(items)} 篇）\n",
        "| 标题 | 作者 | 年份 | 引用数 |",
        "|------|------|------|--------|",
    ]
    for item in sorted(items, key=lambda x: x.get("citingPaper", {}).get("citationCount", 0), reverse=True):
        p = item.get("citingPaper", {})
        lines.append(
            f"| {(p.get('title') or '')[:70]} | {_fmt_authors(p.get('authors',[]))} "
            f"| {p.get('year','—')} | {p.get('citationCount',0)} |"
        )
    return "\n".join(lines)


@mcp.tool()
async def get_references(
    paper_id: str,
    limit: int = 50,
) -> str:
    """
    List papers REFERENCED BY the given paper (backward citations).

    Args:
        paper_id: arXiv ID or Semantic Scholar paperId
        limit:    Max results (default 50)
    """
    if not paper_id.startswith("arXiv:") and not len(paper_id) == 40:
        pid = f"arXiv:{paper_id}"
    else:
        pid = paper_id

    fields = "title,authors,year,citationCount"
    data = _get(f"/paper/{pid}/references", {"fields": fields, "limit": limit})
    if "error" in data:
        return f"❌ API error: {data['error']}"

    items = data.get("data", [])
    lines = [
        f"## 此论文的参考文献（共 {len(items)} 篇）\n",
        "| 标题 | 作者 | 年份 | 引用数 |",
        "|------|------|------|--------|",
    ]
    for item in sorted(items, key=lambda x: x.get("citedPaper", {}).get("citationCount", 0), reverse=True):
        p = item.get("citedPaper", {})
        lines.append(
            f"| {(p.get('title') or '')[:70]} | {_fmt_authors(p.get('authors',[]))} "
            f"| {p.get('year','—')} | {p.get('citationCount',0)} |"
        )
    return "\n".join(lines)


@mcp.tool()
async def get_author_papers(
    author_id: str,
    limit: int = 50,
) -> str:
    """
    List all papers by an author, sorted by citation count.

    Args:
        author_id: Semantic Scholar author ID (numeric string)
        limit:     Max results (default 50)
    """
    fields = "title,year,citationCount,externalIds"
    data = _get(
        f"/author/{author_id}/papers",
        {"fields": fields, "limit": limit, "sort": "citationCount"},
    )
    if "error" in data:
        return f"❌ API error: {data['error']}"

    papers = data.get("data", [])
    lines = [
        f"## 作者 {author_id} 的论文列表（共 {len(papers)} 篇，按引用排序）\n",
        "| 标题 | 年份 | 引用数 | arXiv ID |",
        "|------|------|--------|----------|",
    ]
    for p in papers:
        arxiv_id = (p.get("externalIds") or {}).get("ArXiv", "—")
        lines.append(
            f"| {(p.get('title') or '')[:70]} | {p.get('year','—')} "
            f"| {p.get('citationCount',0)} | {arxiv_id} |"
        )
    return "\n".join(lines)


# ── Entrypoint ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run(transport="stdio")
