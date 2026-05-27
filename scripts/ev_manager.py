# -*- coding: utf-8 -*-
"""
ev_manager.py <slug> <command> [options]

Manages evidence.json — the source-of-truth for all literature citations.
All EV records must be added through this tool; direct JSON editing is forbidden.

Commands:
  add              Add a new EV record (returns EV-xxx ID)
  list             List EV records with optional filters
  coverage         Compute evidence coverage rate for a report file
  gap-count        Count [MATERIAL GAP] annotations in a report file
  audit            Record claim-auditor result (faithful/drifted/unsupported)
  verify-report    Extract every [EV-xxx] sentence from report.md, store back as
                   report_sentence, and flag missing EVs / empty claim_text for
                   agent semantic review
  mark-hypothesis  Record hypothesis-level audit result (green/yellow/red) while
                   preserving the original claim_text in hypothesis_audit block
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


# ── Sentence extraction helpers ────────────────────────────────────────────────

# Matches [EV-007], [EV-007✅], [EV-007 ⚠️] etc.
_EV_REF_PAT = re.compile(r"\[EV-(\d+)[^\]]*\]")
# Sentence = anything on same line that contains at least one [EV-xxx]
_SENT_PAT   = re.compile(r"[^\n。]*\[EV-\d+[^\]]*\][^\n。]*[。\n]?")


def _extract_ev_sentences(text: str) -> list:
    """Return list of {sentence, ev_ids} for every sentence referencing an EV."""
    results = []
    for m in _SENT_PAT.finditer(text):
        sentence = m.group(0).strip()
        ev_ids   = [f"EV-{int(n):03d}" for n in _EV_REF_PAT.findall(sentence)]
        if ev_ids:
            results.append({"sentence": sentence, "ev_ids": ev_ids})
    return results


def _section_text(full_text: str, *header_pats: str) -> str:
    """Extract body of the first section whose heading matches any of header_pats."""
    for pat in header_pats:
        m = re.search(pat, full_text, re.IGNORECASE)
        if m:
            start = m.end()
            nxt   = re.search(r"\n#+\s", full_text[start:])
            end   = start + nxt.start() if nxt else len(full_text)
            return full_text[start:end]
    return ""


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


# ── verify-report ─────────────────────────────────────────────────────────────

def cmd_verify_report(proj_dir: Path, args) -> None:
    """
    For every [EV-xxx] citation in report.md:
      1. Store the surrounding sentence as `report_sentence` in evidence.json.
      2. Flag EVs that don't exist in evidence.json (ghost references).
      3. Flag EVs whose claim_text is empty → agent must do semantic review.
    Prints a ready-to-review checklist:  report sentence / EV original_text side-by-side.
    """
    report_path = Path(args.report_path)
    if not report_path.exists():
        print(f"❌ 文件不存在：{report_path}", file=sys.stderr)
        sys.exit(1)

    ev_data  = load_evidence(proj_dir)
    ev_by_id = {item["ev_id"]: item for item in ev_data.get("items", [])}
    text     = report_path.read_text(encoding="utf-8")

    entries      = _extract_ev_sentences(text)
    ghost        = []   # cited in report but absent from evidence.json
    need_review  = []   # claim_text empty → agent semantic check needed
    ok_count     = 0

    for entry in entries:
        for ev_id in entry["ev_ids"]:
            item = ev_by_id.get(ev_id)
            if item is None:
                ghost.append({"ev_id": ev_id, "sentence": entry["sentence"]})
                continue
            # Write actual report sentence back into EV record
            item["report_sentence"] = entry["sentence"]
            if not item.get("claim_text", "").strip():
                need_review.append({
                    "ev_id":         ev_id,
                    "report_sentence": entry["sentence"][:220],
                    "original_text": item.get("original_text", "")[:220],
                })
            else:
                ok_count += 1

    save_evidence(proj_dir, ev_data)

    total = ok_count + len(need_review) + len(ghost)
    print(f"\n📊 Report-EV 直接匹配检查  ({report_path.name})")
    print(f"   EV 引用总数：{total} 处")
    print(f"   ✅ report_sentence 已回写：{ok_count + len(need_review)} 条")
    print(f"   ❌ 幽灵 EV（evidence.json 无记录）：{len(ghost)} 处")
    print(f"   ⚠️  需 agent 语义核查（claim_text 为空）：{len(need_review)} 条")

    if ghost:
        print("\n❌ 幽灵 EV 引用（须删除或补录）：")
        for g in ghost:
            print(f"   {g['ev_id']}  →  {g['sentence'][:130]}")

    if need_review:
        print("\n⚠️  以下 EV 请 agent 逐条对照 original_text 进行语义核查")
        print("   核查后用：ev_manager.py <slug> audit <ev_id> <faithful|drifted|unsupported>")
        for item in need_review:
            print(f"\n  ─── {item['ev_id']} ───────────────────────────────────────")
            print(f"  报告引用句：{item['report_sentence']}")
            print(f"  EV 原    文：{item['original_text']}")


# ── mark-hypothesis ────────────────────────────────────────────────────────────

def cmd_mark_hypothesis(proj_dir: Path, args) -> None:
    """
    Record the hypothesis-level audit result for one EV.

    Stores a new `hypothesis_audit` object on the EV item that captures:
      - result (green / yellow / red)
      - the original hypothesis sentence (before correction)
      - discrepancy description
      - corrected sentence (agent-written)
      - a snapshot of the original claim_text and audit_result so the
        original record is never overwritten but the distinction is visible.
    """
    ev_data = load_evidence(proj_dir)
    items   = ev_data.get("items", [])

    target = next((i for i in items if i["ev_id"] == args.ev_id), None)
    if target is None:
        print(f"❌ 未找到 EV 记录：{args.ev_id}", file=sys.stderr)
        sys.exit(1)

    target["hypothesis_audit"] = {
        "result":                      args.result,
        "original_hypothesis_sentence": args.sentence,
        "discrepancy":                 args.discrepancy or "",
        "corrected_sentence":          args.corrected  or "",
        # ↓ preserve original records for traceability
        "original_claim_text":         target.get("claim_text",    ""),
        "original_audit_result":       target.get("audit_result"),
        "audited_at":                  now_iso(),
    }

    save_evidence(proj_dir, ev_data)
    sync_evidence_memory(proj_dir)

    icons = {"green": "🟢", "yellow": "🟡", "red": "🔴"}
    print(f"{icons.get(args.result, '?')} {args.ev_id} 假设核查已记录：{args.result}")
    if args.discrepancy:
        print(f"   问题描述：{args.discrepancy}")
    if args.corrected:
        print(f"   已修正为：{args.corrected}")
    print(f"   原始 claim_text 已保留在 hypothesis_audit.original_claim_text")


# ── check-hypothesis ──────────────────────────────────────────────────────────

def _apply_hypothesis_colors(
    report_path: Path,
    text: str,
    marked_evs: list,
    ev_by_id: dict,
    proj_dir: Path,
    ev_data: dict,
) -> None:
    """
    Rewrite hypothesis section in report.md:
      - yellow/red with corrected_sentence: replace the original sentence with the
        corrected version (+ color emoji).  Original sentence is preserved in
        evidence.json → hypothesis_audit.original_hypothesis_sentence.
      - yellow/red without corrected_sentence: append color emoji as warning only.
      - green: append 🟢 emoji.
      - Append/replace the summary table at end of hypothesis section.
    """
    icons = {"green": "🟢", "yellow": "🟡", "red": "🔴"}
    color_map = {ev_id: result for ev_id, result in marked_evs}

    # Locate hypothesis section
    hyp_header_pat = re.compile(
        r"(#+\s+(?:假设|研究假设|核心假设|Hypothesis)[^\n]*\n)", re.IGNORECASE
    )
    m = hyp_header_pat.search(text)
    if not m:
        print("⚠️  未找到假设章节标题（假设/研究假设/Hypothesis），无法写入颜色", file=sys.stderr)
        return

    hyp_header_end = m.end()
    nxt = re.search(r"\n#+\s", text[hyp_header_end:])
    hyp_end = hyp_header_end + nxt.start() if nxt else len(text)
    hyp_body = text[hyp_header_end:hyp_end]

    # Step 1: Replace yellow/red sentences that have a corrected_sentence
    replaced_ev_ids: set = set()
    for ev_id, result in marked_evs:
        if result not in ("yellow", "red"):
            continue
        ha = ev_by_id.get(ev_id, {}).get("hypothesis_audit", {})
        corrected = ha.get("corrected_sentence", "").strip()
        if not corrected:
            continue
        icon = icons[result]
        # Match the sentence line(s) that reference this EV
        sent_pat = re.compile(
            r"[^\n。]*\[" + re.escape(ev_id) + r"[^\]]*\][^\n。]*[。]?\n?"
        )
        base = corrected.rstrip("。\n").rstrip()
        # Ensure [EV-xxx]icon is in the replacement
        if f"[{ev_id}]" in base:
            # Overwrite any existing color emoji after the ref
            base = re.sub(
                r"\[" + re.escape(ev_id) + r"\][🟢🟡🔴]?",
                f"[{ev_id}]{icon}",
                base,
            )
            replacement = base + "。\n"
        else:
            replacement = base + f" [{ev_id}]{icon}。\n"

        hyp_body, n = sent_pat.subn(replacement, hyp_body, count=1)
        if n:
            replaced_ev_ids.add(ev_id)
            item = ev_by_id[ev_id]
            # Preserve originals in hypothesis_audit before overwriting
            ha = item.setdefault("hypothesis_audit", {})
            if "original_claim_text" not in ha:
                ha["original_claim_text"] = item.get("claim_text", "")
            if "original_report_sentence" not in ha:
                ha["original_report_sentence"] = item.get("report_sentence", "")
            if "original_audit_result" not in ha:
                ha["original_audit_result"] = item.get("audit_result")
            # Update live fields to reflect the corrected state
            item["claim_text"]     = corrected
            item["report_sentence"] = replacement.rstrip("\n")
            item["audit_result"]   = "corrected"
            ha["corrected_at"]     = now_iso()
            print(f"   ✏️  {ev_id} 原句已替换；claim_text / report_sentence 已更新（原始错误记录保留于 hypothesis_audit）")

    # Step 2: Append color emoji after bare [EV-xxx] not yet colored
    def _colorize(m_ev):
        n = int(m_ev.group(1))
        ev_id_inner = f"EV-{n:03d}"
        return m_ev.group(0) + icons.get(color_map.get(ev_id_inner, ""), "")

    hyp_body = re.sub(r"\[EV-(\d+)\](?![🟢🟡🔴])", _colorize, hyp_body)

    # Remove any existing summary table
    hyp_body = re.sub(
        r"\n> \*\*假设 EV 核查记录.*",
        "",
        hyp_body,
        flags=re.DOTALL,
    )

    # Build summary table
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = []
    for ev_id, result in sorted(marked_evs, key=lambda x: x[0]):
        icon = icons.get(result, "?")
        ha   = ev_by_id.get(ev_id, {}).get("hypothesis_audit", {})
        note = (ha.get("discrepancy") or "支撑充分")[:60]
        rows.append(f"> | {ev_id} | {icon} | {note} |")

    summary = (
        f"\n> **假设 EV 核查记录 · {today}**\n"
        "> | EV | 评级 | 说明 |\n"
        "> |----|------|------|\n"
        + "\n".join(rows)
        + "\n"
    )
    hyp_body = hyp_body.rstrip() + "\n" + summary

    new_text = text[:hyp_header_end] + hyp_body + text[hyp_end:]
    report_path.write_text(new_text, encoding="utf-8")

    # Persist updated claim_text values back to evidence.json
    if replaced_ev_ids:
        save_evidence(proj_dir, ev_data)
        sync_evidence_memory(proj_dir)

    g = sum(1 for _, r in marked_evs if r == "green")
    y = sum(1 for _, r in marked_evs if r == "yellow")
    r = sum(1 for _, r in marked_evs if r == "red")
    print(f"✅ 颜色标记已写入 {report_path.name}  🟢{g} 🟡{y} 🔴{r}")
    if replaced_ev_ids:
        print(f"   ✏️  共替换 {len(replaced_ev_ids)} 条错误/不确定句子")
        print(f"      · report.md：原句已替换为修正版本")
        print(f"      · evidence.json：claim_text 已更新，原始错误记录保留于 hypothesis_audit")
    print(f"   核查摘要表已追加至假设章节末尾")


def cmd_check_hypothesis(proj_dir: Path, args) -> None:
    """
    Two modes:

    Without --apply (default):
      Extract all [EV-xxx] from the hypothesis section of report_path.
      For each EV, show the hypothesis sentence alongside EV original_text so the
      agent can judge green / yellow / red.
      If hypothesis_audit already stored, show current result.

    With --apply:
      All EVs must already have hypothesis_audit recorded via mark-hypothesis.
      Writes color emoji after each [EV-xxx] in the hypothesis section and appends
      the color-coded summary table.
    """
    report_path = Path(args.report_path)
    if not report_path.exists():
        print(f"❌ 文件不存在：{report_path}", file=sys.stderr)
        sys.exit(1)

    ev_data  = load_evidence(proj_dir)
    ev_by_id = {item["ev_id"]: item for item in ev_data.get("items", [])}
    text     = report_path.read_text(encoding="utf-8")

    # Extract hypothesis section
    hyp_text = _section_text(
        text,
        r"#+\s+(?:假设|研究假设|核心假设|Hypothesis)[^\n]*\n",
    )
    if not hyp_text:
        print("⚠️  未找到假设章节（搜索关键词：假设 / 研究假设 / Hypothesis）", file=sys.stderr)
        sys.exit(1)

    entries = _extract_ev_sentences(hyp_text)
    if not entries:
        print("⚠️  假设章节中无 [EV-xxx] 引用，无需核查")
        return

    all_ev_ids = [ev_id for e in entries for ev_id in e["ev_ids"]]
    print(f"\n📋 假设 EV 核查  ({report_path.name}，共 {len(all_ev_ids)} 条引用)\n{'─'*60}")

    needs_review = []
    marked       = []

    for entry in entries:
        for ev_id in entry["ev_ids"]:
            item = ev_by_id.get(ev_id)
            if item is None:
                print(f"❌ {ev_id}  幽灵 EV（evidence.json 无记录）→ 删除引用或补录")
                needs_review.append(ev_id)
                continue

            ha = item.get("hypothesis_audit")
            if ha:
                icons = {"green": "🟢", "yellow": "🟡", "red": "🔴"}
                icon  = icons.get(ha.get("result", ""), "?")
                print(f"{icon} {ev_id}  已审：{ha.get('result')}")
                if ha.get("discrepancy"):
                    print(f"   问题：{ha['discrepancy']}")
                if ha.get("corrected_sentence"):
                    print(f"   修正：{ha['corrected_sentence']}")
                marked.append((ev_id, ha["result"]))
            else:
                print(f"⚪ {ev_id}  待审")
                print(f"   假设句：{entry['sentence'][:180]}")
                print(f"   EV原文：{item.get('original_text','')[:180]}")
                print(
                    f"   → 判定后执行：\n"
                    f"     python scripts/ev_manager.py {proj_dir.name} mark-hypothesis {ev_id} "
                    f"green|yellow|red \\\n"
                    f"       --sentence \"<原始假设句>\" "
                    f"[--discrepancy \"<差异说明>\"] [--corrected \"<修正句>\"]"
                )
                needs_review.append(ev_id)

    print(f"\n{'─'*60}")
    print(f"已审：{len(marked)} 条  🟢{sum(1 for _,r in marked if r=='green')} "
          f"🟡{sum(1 for _,r in marked if r=='yellow')} "
          f"🔴{sum(1 for _,r in marked if r=='red')}  │  待审：{len(needs_review)} 条")

    if needs_review:
        print(f"\n⚠️  还有 {len(needs_review)} 条未审，完成 mark-hypothesis 后再加 --apply 写入颜色")
        return

    if args.apply:
        _apply_hypothesis_colors(report_path, text, marked, ev_by_id, proj_dir, ev_data)
    else:
        print("\n所有 EV 已审完。加 --apply 将颜色标记写入 report.md：")
        print(f"  python scripts/ev_manager.py {proj_dir.name} check-hypothesis "
              f"{report_path} --apply")


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

    # verify-report
    p_vr = sub.add_parser(
        "verify-report",
        help="从 report.md 提取每条 [EV-xxx] 引用句，回写至 evidence.json 并列出需语义核查项",
    )
    p_vr.add_argument("report_path", help="report.md 路径")

    # check-hypothesis
    p_ch = sub.add_parser(
        "check-hypothesis",
        help="列出假设章节所有 EV 引用的核查状态；--apply 将颜色标记写入 report.md",
    )
    p_ch.add_argument("report_path", help="report.md 路径")
    p_ch.add_argument(
        "--apply", action="store_true",
        help="所有 EV 已完成 mark-hypothesis 后，将颜色标记写入 report.md",
    )

    # mark-hypothesis
    p_mh = sub.add_parser(
        "mark-hypothesis",
        help="记录假设 EV 核查结果（green/yellow/red），保留原始 claim_text",
    )
    p_mh.add_argument("ev_id",   help="EV 编号，如 EV-007")
    p_mh.add_argument("result",  choices=["green", "yellow", "red"], help="核查评级")
    p_mh.add_argument("--sentence",    required=True,
                      help="修改前的原假设引用句（完整句子）")
    p_mh.add_argument("--discrepancy", default="",
                      help="若 yellow/red：问题描述（原文与声明的差异）")
    p_mh.add_argument("--corrected",   default="",
                      help="若 yellow/red：修正后的句子（已写入 report.md）")

    args   = parser.parse_args()
    proj_dir = STATE_DIR / args.slug

    if not proj_dir.exists():
        print(f"❌ 项目不存在：{args.slug}", file=sys.stderr)
        sys.exit(1)

    {"add":               cmd_add,
     "list":              cmd_list,
     "coverage":          cmd_coverage,
     "gap-count":         cmd_gap_count,
     "audit":             cmd_audit,
     "verify-report":     cmd_verify_report,
     "check-hypothesis":  cmd_check_hypothesis,
     "mark-hypothesis":   cmd_mark_hypothesis}[args.command](proj_dir, args)


if __name__ == "__main__":
    main()
