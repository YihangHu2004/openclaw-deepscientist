"""
Wolfram|Alpha MCP server — natural language math & science queries.

Setup:
  pip install mcp httpx
  Set WOLFRAM_APP_ID env var or edit APP_ID below.

Usage (stdio):
  python wolfram_tool.py
"""

import os
import httpx
from mcp.server.fastmcp import FastMCP

APP_ID = os.environ.get("WOLFRAM_APP_ID", "Q98VV64QX4")

mcp = FastMCP("wolfram")

# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #

LLM_URL  = "https://www.wolframalpha.com/api/v1/llm-api"
FULL_URL = "https://api.wolframalpha.com/v2/query"


async def _llm(query: str) -> str:
    """Call the LLM API endpoint — returns a concise plaintext answer optimised for LLMs."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(LLM_URL, params={"appid": APP_ID, "input": query})
        if r.status_code == 501:
            return f"[No answer available for: {query}]"
        r.raise_for_status()
        return r.text.strip()


async def _full_plaintext(query: str, max_pods: int = 6) -> str:
    """Call the /v2/query endpoint and return pod titles + plaintext."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(FULL_URL, params={
            "appid": APP_ID, "input": query,
            "format": "plaintext", "output": "JSON",
        })
        r.raise_for_status()
        data = r.json()

    pods = data.get("queryresult", {}).get("pods", [])
    if not pods:
        return "No results."

    lines = []
    for pod in pods[:max_pods]:
        title = pod.get("title", "")
        subpods = pod.get("subpods", [])
        texts = [s.get("plaintext", "").strip() for s in subpods if s.get("plaintext")]
        if texts:
            lines.append(f"### {title}\n" + "\n".join(texts))
    return "\n\n".join(lines) if lines else "No plaintext content."

# --------------------------------------------------------------------------- #
#  Tools
# --------------------------------------------------------------------------- #

@mcp.tool()
async def wolfram_query(query: str) -> str:
    """
    Send a natural language query to Wolfram|Alpha and get a short answer.

    Examples:
      "integrate x^2 sin(x) dx"
      "solve x^2 - 5x + 6 = 0"
      "eigenvalues of {{1,2},{3,4}}"
      "speed of light in km/h"
      "derivative of log(x^2 + 1)"
    """
    return await _llm(query)


@mcp.tool()
async def wolfram_full(query: str, max_pods: int = 6) -> str:
    """
    Send a query to Wolfram|Alpha and return detailed step-by-step results
    (multiple pods: input interpretation, results, plots description, etc.).

    Use this when wolfram_query returns no short answer, or when you need
    intermediate steps (e.g. "show steps for integral of x*sin(x)").
    """
    return await _full_plaintext(query, max_pods=max_pods)


@mcp.tool()
async def wolfram_check_equation(lhs: str, rhs: str) -> str:
    """
    Check whether two mathematical expressions are equal using Wolfram|Alpha.

    Args:
      lhs: left-hand side expression (e.g. "(x+y)^2")
      rhs: right-hand side expression (e.g. "x^2 + 2*x*y + y^2")
    """
    query = f"Is {lhs} equal to {rhs}?"
    return await _llm(query)


# --------------------------------------------------------------------------- #
#  Entrypoint
# --------------------------------------------------------------------------- #

if __name__ == "__main__":
    mcp.run(transport="stdio")
