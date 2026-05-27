# -*- coding: utf-8 -*-
"""
ev_manager.py <slug> <command> [options]

Manages evidence.json — the source-of-truth for all literature citations.
All EV records must be added through this tool; direct JSON editing is forbidden.

Commands:
  add          Add a new EV record (returns EV-xxx ID)
  list         List EV records with optional filters
  coverage     Compute evidence coverage rate for a report file
  gap-count    Count [MATERIAL GAP] annotations in a report file
  audit        Record claim-auditor result (faithful/drifted/unsupported)
"""
import argparse
import json
import re
import sys
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
from datetime import datetime, timezone
from pathlib import Path

try:
    from evidence_memory import build_memory
except Exception:  # pragma: no cover - cache sync must not block EV writes
    build_memory = None

WORKSPACE = Path(__file__).parent.parent
STATE_DIR  = WORKSPACE / "state" / "projects"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_evidence(proj_dir: Path) -> dict:
    ev_path = proj_dir / "evidence.json"
    if not ev_path.exists():
        print("❌ evidence.json 不存在，请先运行 init_project.py", file=sys.stderr)
        sys.exit(1)
    return json.loads(ev_path.read_text(encoding="utf-8"))


def save_evidence(proj_dir: Path, data: dict) -> None:
    ev_path = proj_dir / "evidence.json"
    ev_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def sync_evidence_memory(proj_dir: Path) -> list:
    if build_memory is None:
        print("⚠️  evidence_memory.py 不可用，已跳过证据记忆同步", file=sys.stderr)
        return []
    else:
        try:
            memory = build_memory(proj_dir, proj_dir.name)
            return memory.get("_last_detected_conflicts", [])
        except Exception as exc:
            print(f"⚠️  证据记忆同步失败：{exc}", file=sys.stderr)
            return []


def append_conflict_todos(proj_dir: Path, conflicts: list) -> None:
    if not conflicts:
        return
    todo_path = proj_dir / "TODO.md"
    if not todo_path.exists():
        return

    lines = []
    for conflict in conflicts:
        new_ev = conflict.get("ev_id", "?")
        old_ev = conflict.get("target_ev_id", "?")
        reason = conflict.get("reason", "").strip()
        suffix = f" — {reason}" if reason else ""
        lines.append(f"- [ ] Resolve conflict between {new_ev} and {old_ev} in Lit Review{suffix}")

    with todo_path.open("a", encoding="utf-8") as f:
        f.write("\n## Scientific conflicts\n")
        for line in lines:
            f.write(f"{line}\n")


def print_conflict_warnings(conflicts: list) -> None:
    if not conflicts:
        return

    red = "\033[91m"
    yellow = "\033[93m"
    reset = "\033[0m"
    for conflict in conflicts:
        new_ev = conflict.get("ev_id", "?")
        old_ev = conflict.get("target_ev_id", "?")
        print(f"\n{red}[CONTROVERSY DETECTED]{reset} {new_ev} contradicts {old_ev}")
        print(f"{yellow}new:{reset} {conflict.get('source_summary', '')[:180]}")
        print(f"{yellow}old:{reset} {conflict.get('target_summary', '')[:180]}")
        print(f"{yellow}reason:{reset} {conflict.get('reason', '')}")


# ── Commands ───────────────────────────────────────────────────────────────────

def cmd_add(proj_dir: Path, args) -> None:
    ev = load_evidence(proj_dir)
    ev_id = f"EV-{ev['next_ev_id']:03d}"
    ev["next_ev_id"] += 1

    item = {
        "ev_id":          ev_id,
        "paper_id":       args.paper_id,
        "cache_key":      "",
        "original_text":  args.original,
        "source_type":    args.source_type,
        "claim_text":     args.claim or "",
        "claim_location": args.location or "",
        "stage_added":    args.stage,
        "verified":       True,
        "confidence":     args.confidence,
        "audit_result":   None,
        "added_at":       now_iso(),
    }
    ev["items"].append(item)
    save_evidence(proj_dir, ev)
    conflicts = sync_evidence_memory(proj_dir)
    print_conflict_warnings(conflicts)
    append_conflict_todos(proj_dir, conflicts)

    conf_icon = {"high": "🟢", "medium": "🟡", "low": "🔴"}.get(args.confidence, "⚪")
    print(f"✅ {ev_id} 已添加 {conf_icon}")
    print(f"   来源：{args.paper_id}  置信度：{args.confidence}")
    print(f"   原文：{args.original[:100]}{'…' if len(args.original) > 100 else ''}")
    print(f"\n→ 在报告中引用时请标注：[{ev_id}]")


def cmd_list(proj_dir: Path, args) -> None:
    ev = load_evidence(proj_dir)
    items = ev.get("items", [])

    if hasattr(args, "stage") and args.stage is not None:
        items = [i for i in items if i.get("stage_added") == args.stage]
    if hasattr(args, "confidence") and args.confidence:
        items = [i for i in items if i.get("confidence") == args.confidence]

    print(f"\n📋 EV 记录（共 {len(items)} 条）\n")
    for item in items:
        ci = {"high": "🟢", "medium": "🟡", "low": "🔴"}.get(item.get("confidence", ""), "⚪")
        audit = item.get("audit_result")
        ai = {"faithful": "✅", "drifted": "⚠️ ", "unsupported": "❌"}.get(audit or "", "  ")
        print(f"  {item['ev_id']}  {ci}[{item.get('confidence','?')}]  {ai}  paper:{item.get('paper_id','?')}")
        orig = item.get("original_text", "")
        print(f"     原文：{orig[:90]}{'…' if len(orig) > 90 else ''}")
        claim = item.get("claim_text", "")
        if claim:
            print(f"     声明：{claim[:90]}{'…' if len(claim) > 90 else ''}")
        print()


def cmd_coverage(proj_dir: Path, args) -> None:
    report_path = Path(args.report_path)
    if not report_path.exists():
        print(f"❌ 文件不存在：{report_path}", file=sys.stderr)
        sys.exit(1)

    text = report_path.read_text(encoding="utf-8")

    # Sentences containing literature claim signals.
    # Percentages only count when co-occurring with a performance/comparison verb.
    LIT_PAT = re.compile(
        r"[^\n。]*(?:"
        r"研究表明|等人|et al\.|according to|表明|发现|证明|显示|达到|实现了"
        r"|(?:超越|超过|提升|提高|改善|降低|减少|增加|outperform|surpass|achiev|improv|reduc|increas|decreas)"
        r"[^\n。]{0,60}\d+\s*[%％]"
        r")[^\n。]{0,200}[。\n]",
        re.IGNORECASE,
    )
    lit_sentences = list(dict.fromkeys(LIT_PAT.findall(text)))  # deduplicate, preserve order
    ev_covered    = [s for s in lit_sentences if re.search(r"\[EV-\d+\]", s)]

    total   = len(lit_sentences)
    covered = len(ev_covered)
    rate    = covered / total if total > 0 else 0.0
    icon    = "✅" if rate >= 0.80 else "❌"

    print(f"\n📊 证据覆盖率报告  ({report_path.name})")
    print(f"   文献结论句总数：{total} 条")
    print(f"   有 [EV-xxx] 标注：{covered} 条")
    print(f"   覆盖率：{covered}/{total} = {rate:.1%} {icon}  （要求 ≥80%）")

    also_total = len(re.findall(r"\[EV-\d+\]", text))
    print(f"   报告中 [EV-xxx] 总引用次数：{also_total}")

    if rate < 0.80 and total > 0:
        uncovered = [s for s in lit_sentences if not re.search(r"\[EV-\d+\]", s)]
        print(f"\n🔴 缺少 EV 标注的句子（前 5 条）：")
        for s in uncovered[:5]:
            print(f"   · {s.strip()[:110]}")


def cmd_gap_count(proj_dir: Path, args) -> None:
    report_path = Path(args.report_path)
    if not report_path.exists():
        print(f"❌ 文件不存在：{report_path}", file=sys.stderr)
        sys.exit(1)

    text = report_path.read_text(encoding="utf-8")
    gaps = re.findall(r"\[MATERIAL GAP[^\]]*\]", text)

    LIT_PAT = re.compile(
        r"[^\n。]*(?:"
        r"研究表明|等人|et al\.|according to|表明|发现|证明|显示|达到|实现了"
        r"|(?:超越|超过|提升|提高|改善|降低|减少|增加|outperform|surpass|achiev|improv|reduc|increas|decreas)"
        r"[^\n。]{0,60}\d+\s*[%％]"
        r")[^\n。]{0,200}[。\n]",
        re.IGNORECASE,
    )
    lit_count = len(LIT_PAT.findall(text))
    ratio     = len(gaps) / lit_count if lit_count > 0 else 0.0
    icon      = "✅" if ratio <= 0.20 else "❌"

    print(f"\n📊 [MATERIAL GAP] 统计  ({report_path.name})")
    print(f"   [MATERIAL GAP] 数量：{len(gaps)} 处")
    print(f"   文献结论句总数：{lit_count} 条")
    print(f"   比例：{ratio:.1%} {icon}  （上限 20%）")

    if gaps:
        print(f"\n📋 标注列表：")
        for g in gaps:
            print(f"   · {g}")


def cmd_audit(proj_dir: Path, args) -> None:
    ev = load_evidence(proj_dir)
    items = ev.get("items", [])

    target = next((i for i in items if i["ev_id"] == args.ev_id), None)
    if target is None:
        print(f"❌ 未找到 EV 记录：{args.ev_id}", file=sys.stderr)
        sys.exit(1)

    old = target.get("audit_result")
    target["audit_result"] = args.result
    save_evidence(proj_dir, ev)
    sync_evidence_memory(proj_dir)

    icon = {"faithful": "✅", "drifted": "⚠️ ", "unsupported": "❌"}.get(args.result, "?")
    print(f"{icon} {args.ev_id} 审计结果已记录：{args.result}")
    if old:
        print(f"   （覆盖旧结果：{old}）")
    if args.result == "drifted" and args.note:
        print(f"   修改建议：{args.note}")
    elif args.result == "unsupported":
        print(f"   ⚠️  此条 EV 需修改报告正文，删除或替换相关声明")


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="证据记录管理（evidence.json）")
    parser.add_argument("slug", help="项目 slug")
    sub = parser.add_subparsers(dest="command", required=True)

    # add
    p_add = sub.add_parser("add", help="添加 EV 记录")
    p_add.add_argument("--paper-id",    required=True, dest="paper_id",
                       help="arXiv ID 或 DOI（如 2310.08560）")
    p_add.add_argument("--original",    required=True,
                       help="原文文段（逐字照抄，不得改写）")
    p_add.add_argument("--confidence",  required=True,
                       choices=["high", "medium", "low"])
    p_add.add_argument("--source-type", default="full_text", dest="source_type",
                       choices=["full_text", "truncated_full_text", "abstract_only"])
    p_add.add_argument("--claim",       default="",
                       help="报告中引用该 EV 的完整句子（可在写报告后补填）")
    p_add.add_argument("--location",    default="",
                       help="在报告中的位置（如 '§2 Related Work 第 3 段'）")
    p_add.add_argument("--stage",       type=int, default=3,
                       help="在哪个阶段添加（默认 3）")

    # list
    p_list = sub.add_parser("list", help="列出 EV 记录")
    p_list.add_argument("--stage",      type=int, help="只显示指定阶段的 EV")
    p_list.add_argument("--confidence", choices=["high", "medium", "low"],
                        help="按置信度过滤")

    # coverage
    p_cov = sub.add_parser("coverage", help="计算报告证据覆盖率")
    p_cov.add_argument("report_path", help="report.md 路径")

    # gap-count
    p_gap = sub.add_parser("gap-count", help="统计 [MATERIAL GAP] 数量")
    p_gap.add_argument("report_path", help="report.md 路径")

    # audit
    p_aud = sub.add_parser("audit", help="记录 claim-auditor 审计结果")
    p_aud.add_argument("ev_id", help="EV 编号（如 EV-003）")
    p_aud.add_argument("result", choices=["faithful", "drifted", "unsupported"],
                       help="审计判定")
    p_aud.add_argument("--note", default="", help="漂移说明或修改建议")

    args   = parser.parse_args()
    proj_dir = STATE_DIR / args.slug

    if not proj_dir.exists():
        print(f"❌ 项目不存在：{args.slug}", file=sys.stderr)
        sys.exit(1)

    {"add":       cmd_add,
     "list":      cmd_list,
     "coverage":  cmd_coverage,
     "gap-count": cmd_gap_count,
     "audit":     cmd_audit}[args.command](proj_dir, args)


if __name__ == "__main__":
    main()
