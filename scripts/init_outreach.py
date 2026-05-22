# -*- coding: utf-8 -*-
"""
init_outreach.py <slug>

Initializes the outreach state directory for a new outreach project:
  state/outreach/<slug>/
    ├── outreach_state.json
    ├── contacts.json
    └── drafts/

Exit code: 0 on success, 1 on error.
"""
import json
import sys
import argparse
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

WORKSPACE = Path(__file__).parent.parent
OUTREACH_DIR = WORKSPACE / "state" / "outreach"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def init_outreach(slug: str, force: bool = False) -> None:
    proj_dir = OUTREACH_DIR / slug

    if proj_dir.exists() and not force:
        print(f"⚠️  outreach 项目已存在：{slug}")
        print(f"   目录：{proj_dir}")
        print("   使用 --force 强制重新初始化（不删除已有联系人）")
        sys.exit(1)

    proj_dir.mkdir(parents=True, exist_ok=True)
    (proj_dir / "drafts").mkdir(exist_ok=True)

    # outreach_state.json
    state_path = proj_dir / "outreach_state.json"
    if not state_path.exists() or force:
        state = {
            "slug": slug,
            "created_at": now_iso(),
            "last_updated": now_iso(),
            "status": "active",
            "total_contacts": 0,
            "stats": {
                "pending": 0,
                "researching": 0,
                "email_unverified": 0,
                "draft": 0,
                "sent": 0,
                "replied_positive": 0,
                "replied_negative": 0,
                "replied_neutral": 0,
            },
        }
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    # contacts.json
    contacts_path = proj_dir / "contacts.json"
    if not contacts_path.exists():
        contacts = {
            "schema_version": 2,
            "project": slug,
            "next_contact_id": 1,
            "items": [],
        }
        contacts_path.write_text(json.dumps(contacts, ensure_ascii=False, indent=2), encoding="utf-8")

    width = 54
    bar = "═" * width
    print(f"\n╔{bar}╗")
    print(f"║  🦞 Outreach 项目初始化完成                        ║")
    print(f"╠{bar}╣")
    print(f"║  Slug：{slug:<47}║")
    print(f"║  目录：state/outreach/{slug:<32}║")
    print(f"╠{bar}╣")
    print(f"║  📁 已创建：                                        ║")
    print(f"║     · outreach_state.json                           ║")
    print(f"║     · contacts.json                                 ║")
    print(f"║     · drafts/                                       ║")
    print(f"╠{bar}╣")
    print(f"║  ⚠️  开始前请确认 USER_PROFILE.md 已填写            ║")
    print(f"║  下一步：python scripts/outreach_manager.py         ║")
    print(f"║          {slug} add --name \"Prof X\" --institution MIT ║")
    print(f"╚{bar}╝\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="初始化 outreach 项目目录")
    parser.add_argument("slug", help="项目标识符（英文小写连字符）")
    parser.add_argument("--force", action="store_true", help="强制重新初始化")
    args = parser.parse_args()

    slug = args.slug.strip().lower()
    if not slug or "/" in slug or "\\" in slug:
        print("❌ slug 格式错误，使用英文小写和连字符，如 phd-2027", file=sys.stderr)
        sys.exit(1)

    init_outreach(slug, force=args.force)


if __name__ == "__main__":
    main()
