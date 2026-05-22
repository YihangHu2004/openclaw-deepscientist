# -*- coding: utf-8 -*-
"""
outreach_manager.py <slug> <command> [options]

Manages contacts in an outreach project.

Commands:
  add          Add a new professor contact
  list         List contacts (with optional status filter)
  note         Write research notes for a contact
  profile      Write portrait data (research themes, style, match points)
  verify-email Confirm professor email address
  mark-sent    Mark email as sent
  mark-replied Record a reply
  stats        Show project statistics panel

Exit code: 0 on success, 1 on error.
"""
import json
import sys
import argparse
from datetime import datetime, timezone
from pathlib import Path

RUMOR_SOURCES = [
    "homepage_bio", "lab_news", "twitter", "reddit",
    "news_article", "ratemyprofessor", "conference_talk",
    "blog", "student_profile", "other",
]
RUMOR_RELEVANCE = [
    "mentorship", "personality", "lab_culture", "research_direction",
    "openings", "funding", "awards", "talks", "other",
]

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

WORKSPACE = Path(__file__).parent.parent
OUTREACH_DIR = WORKSPACE / "state" / "outreach"

STATUS_ICONS = {
    "pending": "⬜",
    "researching": "🔍",
    "email_unverified": "📧",
    "draft": "📝",
    "sent": "✉️ ",
    "replied": "💬",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_contacts(proj_dir: Path) -> dict:
    path = proj_dir / "contacts.json"
    if not path.exists():
        print(f"❌ contacts.json 不存在，请先运行 init_outreach.py {proj_dir.name}", file=sys.stderr)
        sys.exit(1)
    return json.loads(path.read_text(encoding="utf-8"))


def save_contacts(proj_dir: Path, data: dict) -> None:
    data["project"] = proj_dir.name
    path = proj_dir / "contacts.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    _update_state_stats(proj_dir, data)


def _update_state_stats(proj_dir: Path, contacts: dict) -> None:
    state_path = proj_dir / "outreach_state.json"
    if not state_path.exists():
        return
    state = json.loads(state_path.read_text(encoding="utf-8"))
    items = contacts.get("items", [])
    stats: dict = {k: 0 for k in ["pending", "researching", "email_unverified", "draft", "sent",
                                   "replied_positive", "replied_negative", "replied_neutral"]}
    for item in items:
        s = item.get("status", "pending")
        if s == "replied":
            sentiment = item.get("reply_sentiment", "neutral")
            stats[f"replied_{sentiment}"] = stats.get(f"replied_{sentiment}", 0) + 1
        elif s in stats:
            stats[s] += 1
    state["stats"] = stats
    state["total_contacts"] = len(items)
    state["last_updated"] = now_iso()
    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def next_contact_id(data: dict) -> str:
    n = data.get("next_contact_id", 1)
    data["next_contact_id"] = n + 1
    return f"CTX-{n:03d}"


def find_contact(data: dict, contact_id: str) -> tuple[dict | None, int]:
    for i, item in enumerate(data.get("items", [])):
        if item["contact_id"] == contact_id:
            return item, i
    return None, -1


# ─── Commands ────────────────────────────────────────────────────────────────

def cmd_add(proj_dir: Path, args: argparse.Namespace) -> None:
    data = load_contacts(proj_dir)
    cid = next_contact_id(data)

    email_status = "user_provided" if args.email else "unverified"
    contact: dict = {
        "contact_id": cid,
        "name": args.name,
        "institution": args.institution,
        "department": getattr(args, "department", None) or "",
        "email": args.email or "",
        "email_verified": bool(args.email),
        "email_status": email_status,
        "homepage": getattr(args, "homepage", None) or "",
        "lab_homepage": "",
        "paper_sources": ([args.paper_url] if getattr(args, "paper_url", None) else []),
        "research_themes": [],
        "lab_style": "",
        "lab_activity": "",
        "lab_size_estimate": "",
        "current_openings": "unknown",
        "notes": "",
        "rumor_board": [],
        "user_match_points": [],
        "email_type": getattr(args, "type", None) or "",
        "email_style": "",
        "status": "email_unverified" if not args.email else "pending",
        "added_at": now_iso()[:10],
        "last_updated": now_iso()[:10],
        "email_sent_at": None,
        "reply_received_at": None,
        "reply_sentiment": None,
    }

    data["items"].append(contact)
    save_contacts(proj_dir, data)

    print(f"✅ 联系人已添加：{cid}")
    print(f"   {args.name} @ {args.institution}")
    if not args.email:
        print(f"   ⚠️  邮箱未提供，状态：email_unverified")
        print(f"   调研后请运行：python scripts/outreach_manager.py {proj_dir.name} verify-email {cid} \"email@example.com\"")
    print(f"   下一步：DeepClaw 执行 O1 调研阶段")


def cmd_list(proj_dir: Path, args: argparse.Namespace) -> None:
    data = load_contacts(proj_dir)
    items = data.get("items", [])

    status_filter = getattr(args, "status", None)
    if status_filter:
        items = [x for x in items if x.get("status") == status_filter]

    if not items:
        print(f"（无联系人{'，状态：' + status_filter if status_filter else ''}）")
        return

    width = 70
    bar = "─" * width
    print(f"\n{'联系人列表':^{width}}")
    print(bar)
    print(f"{'ID':<10} {'姓名':<20} {'机构':<16} {'状态':<14} {'邮箱'}")
    print(bar)
    for item in items:
        icon = STATUS_ICONS.get(item.get("status", "pending"), "?")
        email_display = item.get("email") or "（未知）"
        verified = "✓" if item.get("email_verified") else "✗"
        print(f"{item['contact_id']:<10} {item['name']:<20} {item['institution']:<16} {icon}{item.get('status',''):<13} {verified} {email_display}")
    print(bar)
    print(f"共 {len(items)} 人\n")


def cmd_note(proj_dir: Path, args: argparse.Namespace) -> None:
    data = load_contacts(proj_dir)
    contact, idx = find_contact(data, args.contact_id)
    if contact is None:
        print(f"❌ 找不到联系人：{args.contact_id}", file=sys.stderr)
        sys.exit(1)

    existing = contact.get("notes", "")
    timestamp = now_iso()[:19].replace("T", " ")
    new_note = f"[{timestamp}] {args.text}"
    contact["notes"] = (existing + "\n" + new_note).strip()
    contact["last_updated"] = now_iso()[:10]
    if contact.get("status") == "pending":
        contact["status"] = "researching"
    data["items"][idx] = contact
    save_contacts(proj_dir, data)
    print(f"✅ 笔记已写入 {args.contact_id}")


def cmd_profile(proj_dir: Path, args: argparse.Namespace) -> None:
    data = load_contacts(proj_dir)
    contact, idx = find_contact(data, args.contact_id)
    if contact is None:
        print(f"❌ 找不到联系人：{args.contact_id}", file=sys.stderr)
        sys.exit(1)

    # Parse themes: "CoT reasoning:0.82,math:0.71"
    if getattr(args, "themes", None):
        themes = []
        for part in args.themes.split(","):
            part = part.strip()
            if ":" in part:
                name, score_str = part.rsplit(":", 1)
                try:
                    score = float(score_str.strip())
                except ValueError:
                    score = 0.5
                themes.append({"theme": name.strip(), "score": round(score, 3), "papers": []})
            elif part:
                themes.append({"theme": part, "score": 0.5, "papers": []})
        contact["research_themes"] = themes

    if getattr(args, "style", None):
        contact["email_style"] = args.style.upper()

    if getattr(args, "match_points", None):
        contact["user_match_points"] = [p.strip() for p in args.match_points.split(";") if p.strip()]

    if getattr(args, "lab_style", None):
        contact["lab_style"] = args.lab_style

    if getattr(args, "lab_activity", None):
        contact["lab_activity"] = args.lab_activity

    if getattr(args, "openings", None):
        contact["current_openings"] = args.openings

    contact["last_updated"] = now_iso()[:10]
    data["items"][idx] = contact
    save_contacts(proj_dir, data)

    print(f"✅ 画像数据已写入 {args.contact_id}")
    if contact.get("research_themes"):
        for t in contact["research_themes"]:
            print(f"   · {t['theme']}: {t['score']:.2f}")
    if contact.get("email_style"):
        print(f"   · 邮件风格：{contact['email_style']}")
    if contact.get("user_match_points"):
        for mp in contact["user_match_points"]:
            print(f"   · 交集：{mp}")


def cmd_verify_email(proj_dir: Path, args: argparse.Namespace) -> None:
    data = load_contacts(proj_dir)
    contact, idx = find_contact(data, args.contact_id)
    if contact is None:
        print(f"❌ 找不到联系人：{args.contact_id}", file=sys.stderr)
        sys.exit(1)

    contact["email"] = args.email
    contact["email_verified"] = True
    contact["email_status"] = "user_provided"
    contact["last_updated"] = now_iso()[:10]
    if contact.get("status") == "email_unverified":
        contact["status"] = "pending"
    data["items"][idx] = contact
    save_contacts(proj_dir, data)
    print(f"✅ 邮箱已确认：{args.contact_id} → {args.email}")
    print(f"   email_verified = true，可以继续 O2 匹配阶段")


def cmd_mark_sent(proj_dir: Path, args: argparse.Namespace) -> None:
    data = load_contacts(proj_dir)
    contact, idx = find_contact(data, args.contact_id)
    if contact is None:
        print(f"❌ 找不到联系人：{args.contact_id}", file=sys.stderr)
        sys.exit(1)

    if not contact.get("email_verified"):
        print(f"❌ 邮箱未确认，无法标记为已发送。请先运行 verify-email。", file=sys.stderr)
        sys.exit(1)

    contact["status"] = "sent"
    contact["email_type"] = getattr(args, "type", None) or contact.get("email_type", "")
    contact["email_sent_at"] = now_iso()[:10]
    contact["last_updated"] = now_iso()[:10]
    data["items"][idx] = contact
    save_contacts(proj_dir, data)
    print(f"✅ 邮件已标记为已发送：{args.contact_id}")
    print(f"   类型：{contact['email_type']}  发送日期：{contact['email_sent_at']}")


def cmd_mark_replied(proj_dir: Path, args: argparse.Namespace) -> None:
    data = load_contacts(proj_dir)
    contact, idx = find_contact(data, args.contact_id)
    if contact is None:
        print(f"❌ 找不到联系人：{args.contact_id}", file=sys.stderr)
        sys.exit(1)

    sentiment = args.sentiment
    if sentiment not in ("positive", "negative", "neutral"):
        print(f"❌ sentiment 必须是 positive / negative / neutral", file=sys.stderr)
        sys.exit(1)

    contact["status"] = "replied"
    contact["reply_received_at"] = now_iso()[:10]
    contact["reply_sentiment"] = sentiment
    contact["last_updated"] = now_iso()[:10]
    data["items"][idx] = contact
    save_contacts(proj_dir, data)

    icons = {"positive": "😊", "negative": "😔", "neutral": "😐"}
    print(f"✅ 回复已记录：{args.contact_id}  {icons[sentiment]} {sentiment}")


def cmd_stats(proj_dir: Path, _args: argparse.Namespace) -> None:
    state_path = proj_dir / "outreach_state.json"
    if not state_path.exists():
        print("❌ outreach_state.json 不存在", file=sys.stderr)
        sys.exit(1)
    state = json.loads(state_path.read_text(encoding="utf-8"))
    data = load_contacts(proj_dir)
    items = data.get("items", [])

    slug = state.get("slug", proj_dir.name)
    total = state.get("total_contacts", len(items))
    stats = state.get("stats", {})
    last = state.get("last_updated", "")[:10]

    width = 52
    bar = "═" * width
    print(f"\n╔{bar}╗")
    print(f"║  📊 Outreach 统计 · {slug:<31}║")
    print(f"╠{bar}╣")
    print(f"║  总联系人：{total:<4}  最后更新：{last:<19}║")
    print(f"╠{bar}╣")
    rows = [
        ("⬜ 待调研",     stats.get("pending", 0)),
        ("🔍 调研中",     stats.get("researching", 0)),
        ("📧 邮箱待确认", stats.get("email_unverified", 0)),
        ("📝 草稿",       stats.get("draft", 0)),
        ("✉️  已发送",    stats.get("sent", 0)),
        ("😊 积极回复",   stats.get("replied_positive", 0)),
        ("😐 中性回复",   stats.get("replied_neutral", 0)),
        ("😔 消极回复",   stats.get("replied_negative", 0)),
    ]
    for label, count in rows:
        bar_fill = "█" * count
        print(f"║  {label:<12}  {count:<3}  {bar_fill:<20}║")
    print(f"╚{bar}╝\n")

    # Recent contacts
    if items:
        print("最近联系人：")
        for item in items[-5:]:
            icon = STATUS_ICONS.get(item.get("status", "pending"), "?")
            print(f"  {icon} {item['contact_id']} {item['name']:<18} {item['institution']}")


def cmd_rumor(proj_dir: Path, args: argparse.Namespace) -> None:
    """Append a soft-signal entry to a contact's rumor_board."""
    data = load_contacts(proj_dir)
    contact, idx = find_contact(data, args.contact_id)
    if contact is None:
        print(f"❌ 找不到联系人：{args.contact_id}", file=sys.stderr)
        sys.exit(1)

    entry: dict = {
        "source": args.source,
        "content": args.content,
        "url": getattr(args, "url", None) or "",
        "date": now_iso()[:10],
        "sentiment": getattr(args, "sentiment", None) or "neutral",
        "relevance": getattr(args, "relevance", None) or "other",
    }

    board = contact.get("rumor_board") or []
    board.append(entry)
    contact["rumor_board"] = board
    contact["last_updated"] = now_iso()[:10]
    if contact.get("status") == "pending":
        contact["status"] = "researching"
    data["items"][idx] = contact
    save_contacts(proj_dir, data)

    ICONS = {"positive": "✅", "negative": "⚠️ ", "neutral": "ℹ️ "}
    icon = ICONS.get(entry["sentiment"], "·")
    print(f"{icon} 流言板已写入 {args.contact_id} [{entry['source']} / {entry['relevance']}]")
    print(f"   {entry['content'][:80]}{'...' if len(entry['content']) > 80 else ''}")


def cmd_rumor_board(proj_dir: Path, args: argparse.Namespace) -> None:
    """Display the full rumor board for a contact."""
    data = load_contacts(proj_dir)
    contact, _ = find_contact(data, args.contact_id)
    if contact is None:
        print(f"❌ 找不到联系人：{args.contact_id}", file=sys.stderr)
        sys.exit(1)

    board = contact.get("rumor_board") or []
    name = contact.get("name", args.contact_id)
    width = 60
    bar = "─" * width
    ICONS = {"positive": "✅", "negative": "⚠️ ", "neutral": "ℹ️ "}

    print(f"\n{'流言板：' + name:^{width}}")
    print(bar)
    if not board:
        print("  （暂无条目）")
    else:
        for i, entry in enumerate(board, 1):
            icon = ICONS.get(entry.get("sentiment", "neutral"), "·")
            print(f"{i:02d}. {icon} [{entry.get('source','')}] [{entry.get('relevance','')}] {entry.get('date','')}")
            print(f"    {entry.get('content','')}")
            if entry.get("url"):
                print(f"    🔗 {entry['url']}")
            print()
    print(bar)
    print(f"共 {len(board)} 条软信号\n")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Outreach 联系人管理")
    parser.add_argument("slug", help="outreach 项目标识符")
    sub = parser.add_subparsers(dest="command", required=True)

    # add
    p_add = sub.add_parser("add", help="添加教授联系人")
    p_add.add_argument("--name", required=True, help="教授姓名")
    p_add.add_argument("--institution", required=True, help="所在机构")
    p_add.add_argument("--department", help="学院/系")
    p_add.add_argument("--email", help="邮箱（可稍后通过 verify-email 补充）")
    p_add.add_argument("--homepage", help="教授主页 URL")
    p_add.add_argument("--paper-url", dest="paper_url", help="代表论文 URL")
    p_add.add_argument("--type", choices=["phd", "ra"], help="套磁类型")

    # list
    p_list = sub.add_parser("list", help="列出联系人")
    p_list.add_argument("--status", help="按状态过滤")

    # note
    p_note = sub.add_parser("note", help="写入调研笔记")
    p_note.add_argument("contact_id", help="如 CTX-001")
    p_note.add_argument("text", help="笔记内容")

    # profile
    p_profile = sub.add_parser("profile", help="写入教授画像数据")
    p_profile.add_argument("contact_id", help="如 CTX-001")
    p_profile.add_argument("--themes", help="研究主题:得分，逗号分隔。如 'CoT:0.82,math:0.71'")
    p_profile.add_argument("--style", choices=["A", "B", "C"], help="邮件风格")
    p_profile.add_argument("--match-points", dest="match_points", help="用户-教授交集，分号分隔")
    p_profile.add_argument("--lab-style", dest="lab_style", choices=["engineering", "theory", "interdisciplinary"])
    p_profile.add_argument("--lab-activity", dest="lab_activity", choices=["active", "moderate", "inactive"])
    p_profile.add_argument("--openings", choices=["PhD", "RA", "unknown"])

    # verify-email
    p_verify = sub.add_parser("verify-email", help="确认教授邮箱")
    p_verify.add_argument("contact_id", help="如 CTX-001")
    p_verify.add_argument("email", help="经确认的邮箱地址")

    # mark-sent
    p_sent = sub.add_parser("mark-sent", help="标记邮件已发送")
    p_sent.add_argument("contact_id", help="如 CTX-001")
    p_sent.add_argument("--type", choices=["phd", "ra"], help="邮件类型")

    # mark-replied
    p_replied = sub.add_parser("mark-replied", help="记录回复")
    p_replied.add_argument("contact_id", help="如 CTX-001")
    p_replied.add_argument("--sentiment", required=True, choices=["positive", "negative", "neutral"])

    # stats
    sub.add_parser("stats", help="显示统计面板")

    # rumor
    p_rumor = sub.add_parser("rumor", help="写入流言板（软信号）")
    p_rumor.add_argument("contact_id", help="如 CTX-001")
    p_rumor.add_argument("--source", required=True, choices=RUMOR_SOURCES,
                         help="信息来源类型")
    p_rumor.add_argument("--content", required=True, help="内容摘要")
    p_rumor.add_argument("--url", help="原始链接（可选）")
    p_rumor.add_argument("--sentiment", choices=["positive", "negative", "neutral"],
                         default="neutral", help="情感倾向")
    p_rumor.add_argument("--relevance", choices=RUMOR_RELEVANCE,
                         default="other", help="相关维度")

    # rumor-board
    p_rb = sub.add_parser("rumor-board", help="展示联系人流言板")
    p_rb.add_argument("contact_id", help="如 CTX-001")

    args = parser.parse_args()
    slug = args.slug.strip().lower()
    proj_dir = OUTREACH_DIR / slug

    if not proj_dir.exists():
        print(f"❌ outreach 项目不存在：{slug}，请先运行 init_outreach.py {slug}", file=sys.stderr)
        sys.exit(1)

    dispatch = {
        "add": cmd_add,
        "list": cmd_list,
        "note": cmd_note,
        "profile": cmd_profile,
        "verify-email": cmd_verify_email,
        "mark-sent": cmd_mark_sent,
        "mark-replied": cmd_mark_replied,
        "stats": cmd_stats,
        "rumor": cmd_rumor,
        "rumor-board": cmd_rumor_board,
    }

    fn = dispatch.get(args.command)
    if fn is None:
        print(f"❌ 未知命令：{args.command}", file=sys.stderr)
        sys.exit(1)

    fn(proj_dir, args)


if __name__ == "__main__":
    main()
