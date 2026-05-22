# -*- coding: utf-8 -*-
"""
outreach_gate_check.py <slug> G3 <contact_id>

Checks the quality of an email draft in drafts/<contact_id>.md.

G3 checks:
  1. Word count ≤ 200 (PhD) / ≤ 150 (RA)
  2. Contains ≥1 specific paper/project proper noun
  3. No cliché blacklist words
  4. Contains ≥1 user research keyword from USER_PROFILE.md
  5. email_verified == true in contacts.json

Exit code: 0 = PASS, 1 = FAIL.
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

WORKSPACE = Path(__file__).parent.parent
OUTREACH_DIR = WORKSPACE / "state" / "outreach"

WORD_LIMITS = {"phd": 200, "ra": 150, "": 200}

CLICHE_BLACKLIST = [
    r"\bvery passionate\b",
    r"\bdeeply inspired\b",
    r"\bdream school\b",
    r"\bdream program\b",
    r"\bhonored\b",
    r"\btruly fascinated\b",
    r"\bbig fan\b",
    r"\blifelong dream\b",
    r"\bgreatest admiration\b",
    r"\bperfect fit\b",
]


def load_contacts(proj_dir: Path) -> dict:
    path = proj_dir / "contacts.json"
    if not path.exists():
        print(f"❌ contacts.json 不存在", file=sys.stderr)
        sys.exit(1)
    return json.loads(path.read_text(encoding="utf-8"))


def find_contact(data: dict, contact_id: str) -> dict | None:
    for item in data.get("items", []):
        if item["contact_id"] == contact_id:
            return item
    return None


def load_user_keywords() -> list[str]:
    profile_path = WORKSPACE / "USER_PROFILE.md"
    if not profile_path.exists():
        return []
    text = profile_path.read_text(encoding="utf-8")
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("keywords:"):
            raw = line[len("keywords:"):].strip()
            return [kw.strip().lower() for kw in raw.split(",") if kw.strip()]
    return []


def count_words(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))


def check_g3(proj_dir: Path, contact_id: str) -> tuple[bool, list[str], list[str]]:
    """Returns (passed, failures, passes)."""
    data = load_contacts(proj_dir)
    contact = find_contact(data, contact_id)

    if contact is None:
        print(f"❌ 找不到联系人：{contact_id}", file=sys.stderr)
        sys.exit(1)

    draft_path = proj_dir / "drafts" / f"{contact_id}.md"
    if not draft_path.exists():
        print(f"❌ 草稿不存在：drafts/{contact_id}.md", file=sys.stderr)
        print(f"   请先由 DeepClaw 完成 O3 起草阶段", file=sys.stderr)
        sys.exit(1)

    draft_text = draft_path.read_text(encoding="utf-8")
    draft_lower = draft_text.lower()

    failures: list[str] = []
    passes: list[str] = []

    email_type = contact.get("email_type", "").lower()
    word_limit = WORD_LIMITS.get(email_type, 200)

    # Check 1: Word count
    wc = count_words(draft_text)
    if wc > word_limit:
        failures.append(f"字数超限：{wc} 词（上限 {word_limit}，类型 {email_type or 'phd'}）")
    else:
        passes.append(f"字数：{wc} / {word_limit} ✓")

    # Check 2: Specific paper/project proper noun
    # Look for paper titles or project names from research_themes
    themes = contact.get("research_themes", [])
    paper_sources = contact.get("paper_sources", [])
    found_specific = False

    # Extract arxiv IDs and check if any appear in draft
    for src in paper_sources:
        arxiv_match = re.search(r"(\d{4}\.\d{4,5})", src)
        if arxiv_match and arxiv_match.group(1) in draft_text:
            found_specific = True
            break

    # Also check for capitalized multi-word phrases (paper title heuristic: ≥2 capitalized words)
    if not found_specific:
        cap_phrases = re.findall(r"[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+", draft_text)
        # Must have at least 2 words capitalized (proper noun / title)
        if any(len(p.split()) >= 2 for p in cap_phrases):
            found_specific = True

    if not found_specific:
        failures.append("未找到具体论文/项目名称（至少包含一个有标题词组，如论文名或项目名）")
    else:
        passes.append("含具体论文/项目名称 ✓")

    # Check 3: Cliché blacklist
    found_cliches = []
    for pattern in CLICHE_BLACKLIST:
        if re.search(pattern, draft_lower):
            m = re.search(pattern, draft_lower)
            found_cliches.append(m.group(0) if m else pattern)
    if found_cliches:
        failures.append(f"含套话黑名单词：{', '.join(found_cliches)}")
    else:
        passes.append("无套话黑名单词 ✓")

    # Check 4: User research keywords
    keywords = load_user_keywords()
    if keywords:
        found_kws = [kw for kw in keywords if kw in draft_lower]
        if not found_kws:
            failures.append(f"未包含用户研究关键词（USER_PROFILE.md keywords: {', '.join(keywords[:5])}）")
        else:
            passes.append(f"含用户关键词：{', '.join(found_kws)} ✓")
    else:
        passes.append("USER_PROFILE.md 未设置 keywords，跳过关键词检查")

    # Check 5: email_verified
    if not contact.get("email_verified"):
        email_status = contact.get("email_status", "unverified")
        failures.append(f"邮箱未确认（email_verified=false，status={email_status}）→ 运行 verify-email 后再检查")
    else:
        passes.append(f"邮箱已确认：{contact.get('email', '?')} ✓")

    return len(failures) == 0, failures, passes


def print_result(slug: str, contact_id: str, passed: bool, failures: list, passes: list) -> None:
    width = 58
    bar = "═" * width

    status_line = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n╔{bar}╗")
    print(f"║  G3 质量门检查  ·  {slug} / {contact_id:<28}║")
    print(f"╠{bar}╣")
    print(f"║  结果：{status_line:<51}║")
    print(f"╠{bar}╣")

    if passes:
        print(f"║  通过项：{'':49}║")
        for p in passes:
            truncated = p[:55]
            print(f"║    ✓ {truncated:<53}║")

    if failures:
        print(f"╠{bar}╣")
        print(f"║  失败项：{'':49}║")
        for f in failures:
            truncated = f[:55]
            print(f"║    ✗ {truncated:<53}║")

    print(f"╠{bar}╣")
    if passed:
        print(f"║  → 邮件质量通过，可进入 O5 用户审阅阶段          ║")
    else:
        print(f"║  → 修复失败项后重新运行 gate_check               ║")
    print(f"╚{bar}╝\n")


def main() -> None:
    if len(sys.argv) < 4:
        print("用法：python outreach_gate_check.py <slug> G3 <contact_id>", file=sys.stderr)
        sys.exit(1)

    slug = sys.argv[1].strip().lower()
    gate = sys.argv[2].upper()
    contact_id = sys.argv[3].upper()

    if gate != "G3":
        print(f"❌ 目前仅支持 G3 门控，收到：{gate}", file=sys.stderr)
        sys.exit(1)

    proj_dir = OUTREACH_DIR / slug
    if not proj_dir.exists():
        print(f"❌ outreach 项目不存在：{slug}", file=sys.stderr)
        sys.exit(1)

    passed, failures, passes = check_g3(proj_dir, contact_id)
    print_result(slug, contact_id, passed, failures, passes)
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
