# -*- coding: utf-8 -*-
"""
linkedin_scraper.py <slug> <CTX-xxx> <command> [options]

Wraps Bright Data LinkedIn Scraper API for outreach O1d.
Results are written directly to the contact's rumor_board via outreach_manager.

Commands:
  profile  --url <linkedin_url>
               Scrape professor's LinkedIn profile (experience, education, posts).
  alumni   --last-name <name> [--institution <inst>] [--count <N>]
               Search PhD alumni associated with the professor.
  posts    --url <linkedin_url> [--count <N>]
               Fetch professor's recent LinkedIn posts.

Config: reads BRIGHT_DATA_API_TOKEN from USER_CONFIG.md.
        Falls back to graceful skip if token is absent.

Exit codes: 0 = success or graceful skip, 1 = API error.
"""
import json
import re
import subprocess
import sys
import argparse
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

WORKSPACE = Path(__file__).parent.parent
USER_CONFIG = WORKSPACE / "USER_CONFIG.md"

# Bright Data dataset IDs for LinkedIn
BD_DATASET_PROFILE = "gd_l1viktl72bvl7bjuj0"   # LinkedIn Profile Scraper
BD_DATASET_POSTS   = "gd_lyy3tktm25m4avu764"   # LinkedIn Post Scraper
BD_DATASET_PEOPLE  = "gd_l1vikfnt1wgkk4h3hj"   # LinkedIn People Search
BD_API_BASE        = "https://api.brightdata.com/datasets/v3"


# ── Config helpers ─────────────────────────────────────────────────────────────

def load_api_token() -> str | None:
    """Extract Bright Data API Token from USER_CONFIG.md."""
    if not USER_CONFIG.exists():
        return None
    text = USER_CONFIG.read_text(encoding="utf-8")
    m = re.search(r"Bright Data API Token[:\s]+([A-Za-z0-9_\-\.]+)", text)
    if m:
        token = m.group(1).strip()
        return token if len(token) > 10 else None
    return None


def load_proj_dir(slug: str) -> Path:
    proj_dir = WORKSPACE / "state" / "outreach" / slug
    if not proj_dir.exists():
        print(f"❌ outreach 项目不存在：{slug}", file=sys.stderr)
        sys.exit(1)
    return proj_dir


# ── Bright Data API ────────────────────────────────────────────────────────────

def bd_trigger(dataset_id: str, inputs: list[dict], token: str) -> str:
    """Trigger a Bright Data dataset collection. Returns snapshot_id."""
    url = f"{BD_API_BASE}/trigger?dataset_id={dataset_id}&format=json&uncompressed_webhook=true"
    body = json.dumps(inputs).encode("utf-8")
    req = Request(url, data=body, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    try:
        with urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result.get("snapshot_id", "")
    except HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        print(f"❌ Bright Data API 错误 {e.code}: {body_text}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"❌ 网络错误：{e.reason}", file=sys.stderr)
        sys.exit(1)


def bd_fetch_snapshot(snapshot_id: str, token: str, timeout: int = 60) -> list[dict]:
    """Poll until snapshot is ready, then return the records."""
    import time
    url = f"{BD_API_BASE}/snapshot/{snapshot_id}?format=json"
    req = Request(url, headers={"Authorization": f"Bearer {token}"})
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, list):
                    return data
                status = data.get("status", "")
                if status in ("failed", "error"):
                    print(f"❌ Snapshot 失败：{data}", file=sys.stderr)
                    sys.exit(1)
                # still running
                time.sleep(5)
        except HTTPError as e:
            if e.code == 202:   # still processing
                time.sleep(5)
            else:
                print(f"❌ Snapshot 获取错误 {e.code}", file=sys.stderr)
                sys.exit(1)
    print("⚠️  Bright Data snapshot 超时，可稍后用 snapshot_id 重试", file=sys.stderr)
    sys.exit(1)


def write_rumor(slug: str, ctx_id: str, source: str, content: str,
                url: str, sentiment: str, relevance: str) -> None:
    """Delegate to outreach_manager.py rumor command."""
    cmd = [
        sys.executable,
        str(WORKSPACE / "scripts" / "outreach_manager.py"),
        slug, "rumor", ctx_id,
        "--source", source,
        "--content", content,
        "--url", url,
        "--sentiment", sentiment,
        "--relevance", relevance,
    ]
    subprocess.run(cmd, check=True)


# ── Commands ───────────────────────────────────────────────────────────────────

def cmd_profile(slug: str, ctx_id: str, args: argparse.Namespace, token: str) -> None:
    """Scrape a professor's LinkedIn profile."""
    print(f"🔍 正在抓取 LinkedIn 档案：{args.url}")
    snap_id = bd_trigger(BD_DATASET_PROFILE, [{"url": args.url}], token)
    print(f"   snapshot_id: {snap_id}，等待结果...")
    records = bd_fetch_snapshot(snap_id, token)

    if not records:
        print("⚠️  未返回数据", file=sys.stderr)
        return

    p = records[0]
    name       = p.get("name", "")
    headline   = p.get("headline", "")
    followers  = p.get("followers", "")
    about      = (p.get("about") or "")[:200]
    experience = p.get("experience") or []
    education  = p.get("education") or []

    # Build summary
    lines = []
    if headline:
        lines.append(f"职位：{headline}")
    if followers:
        lines.append(f"LinkedIn 关注者：{followers}")
    if about:
        lines.append(f"简介：{about}")

    exp_summary = "; ".join(
        f"{e.get('title','')} @ {e.get('company','')}"
        for e in experience[:3] if e.get("title")
    )
    if exp_summary:
        lines.append(f"经历：{exp_summary}")

    edu_summary = "; ".join(
        f"{e.get('degree','')} {e.get('field','')} @ {e.get('school','')}"
        for e in education[:2] if e.get("school")
    )
    if edu_summary:
        lines.append(f"教育：{edu_summary}")

    content = " | ".join(lines) if lines else f"LinkedIn 档案已获取（{name}）"

    write_rumor(slug, ctx_id,
                source="student_profile",
                content=content,
                url=args.url,
                sentiment="neutral",
                relevance="personality")
    print(f"✅ 档案信息已写入流言板")

    # Save raw JSON for reference
    proj_dir = load_proj_dir(slug)
    raw_path = proj_dir / f"linkedin_{ctx_id}_profile.json"
    raw_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"   原始数据：{raw_path.name}")


def cmd_alumni(slug: str, ctx_id: str, args: argparse.Namespace, token: str) -> None:
    """Search LinkedIn for PhD alumni of a professor."""
    last_name   = args.last_name
    institution = getattr(args, "institution", "") or ""
    count       = getattr(args, "count", 10) or 10

    query = f"PhD {last_name}"
    if institution:
        query += f" {institution}"

    search_url = (
        "https://www.linkedin.com/search/results/people/"
        f"?keywords={query.replace(' ', '%20')}&origin=GLOBAL_SEARCH_HEADER"
    )

    print(f"🔍 正在搜索 PhD 校友：{query}")
    snap_id = bd_trigger(BD_DATASET_PEOPLE,
                         [{"url": search_url, "count": count}],
                         token)
    print(f"   snapshot_id: {snap_id}，等待结果...")
    records = bd_fetch_snapshot(snap_id, token)

    if not records:
        print("⚠️  未找到校友数据")
        return

    # Categorize destinations
    academic, industry, unknown = [], [], []
    for r in records:
        headline = (r.get("headline") or "").lower()
        name_r   = r.get("name", "unknown")
        company  = r.get("current_company", "") or ""
        if any(kw in headline for kw in ("professor", "faculty", "postdoc", "researcher", "phd")):
            academic.append(f"{name_r}（{company}）")
        elif company:
            industry.append(f"{name_r}（{company}）")
        else:
            unknown.append(name_r)

    lines = []
    if academic:
        lines.append(f"学术界：{', '.join(academic[:5])}")
    if industry:
        lines.append(f"工业界：{', '.join(industry[:5])}")
    total = len(records)
    lines.append(f"共找到 {total} 位相关人员")

    content = " | ".join(lines) if lines else f"LinkedIn 校友搜索：{query}，共 {total} 条"

    write_rumor(slug, ctx_id,
                source="student_profile",
                content=content,
                url=search_url,
                sentiment="neutral",
                relevance="mentorship")
    print(f"✅ 校友去向已写入流言板（学术 {len(academic)} / 工业 {len(industry)}）")

    proj_dir = load_proj_dir(slug)
    raw_path = proj_dir / f"linkedin_{ctx_id}_alumni.json"
    raw_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"   原始数据：{raw_path.name}")


def cmd_posts(slug: str, ctx_id: str, args: argparse.Namespace, token: str) -> None:
    """Fetch recent LinkedIn posts from a professor's profile."""
    count = getattr(args, "count", 5) or 5
    print(f"🔍 正在获取 LinkedIn 动态：{args.url}")
    snap_id = bd_trigger(BD_DATASET_POSTS,
                         [{"url": args.url, "count": count}],
                         token)
    print(f"   snapshot_id: {snap_id}，等待结果...")
    records = bd_fetch_snapshot(snap_id, token)

    if not records:
        print("⚠️  未找到动态数据")
        return

    summaries = []
    for post in records[:5]:
        text  = (post.get("text") or "")[:120]
        likes = post.get("likes", 0)
        date  = (post.get("date") or "")[:10]
        if text:
            summaries.append(f"[{date}] {text}（👍{likes}）")

    content = " || ".join(summaries) if summaries else f"获取到 {len(records)} 条 LinkedIn 动态"

    write_rumor(slug, ctx_id,
                source="blog",
                content=content,
                url=args.url,
                sentiment="neutral",
                relevance="personality")
    print(f"✅ LinkedIn 动态（{len(records)} 条）已写入流言板")


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Bright Data LinkedIn 套磁调研工具")
    parser.add_argument("slug",       help="outreach 项目标识符")
    parser.add_argument("contact_id", help="联系人 ID，如 CTX-001")
    sub = parser.add_subparsers(dest="command", required=True)

    p_profile = sub.add_parser("profile", help="抓取教授 LinkedIn 档案")
    p_profile.add_argument("--url", required=True, help="LinkedIn 个人页 URL")

    p_alumni = sub.add_parser("alumni", help="搜索 PhD 校友去向")
    p_alumni.add_argument("--last-name", dest="last_name", required=True, help="教授姓氏")
    p_alumni.add_argument("--institution", help="机构名称（可选，提升精度）")
    p_alumni.add_argument("--count", type=int, default=10, help="最多搜索人数（默认10）")

    p_posts = sub.add_parser("posts", help="获取教授 LinkedIn 近期动态")
    p_posts.add_argument("--url", required=True, help="LinkedIn 个人页 URL")
    p_posts.add_argument("--count", type=int, default=5, help="获取帖子数（默认5）")

    args = parser.parse_args()

    token = load_api_token()
    if not token:
        print("⚠️  未找到 Bright Data API Token（USER_CONFIG.md 中 'Bright Data API Token' 字段）")
        print("   跳过 LinkedIn 结构化抓取，使用 web_search 策略替代")
        print("   注册地址：https://brightdata.com（新账号 20 次免费额度）")
        sys.exit(0)   # graceful skip, not an error

    dispatch = {
        "profile": cmd_profile,
        "alumni":  cmd_alumni,
        "posts":   cmd_posts,
    }
    dispatch[args.command](args.slug, args.contact_id, args, token)


if __name__ == "__main__":
    main()
