# -*- coding: utf-8 -*-
"""
session_restore.py <slug>

Reads pipeline_state.json and prints a recovery card so the scientist
agent can re-orient at the start of a new session.

Exit code: 0 on success, 1 on error.
"""
import json
import sys
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
from pathlib import Path

WORKSPACE = Path(__file__).parent.parent
STATE_DIR  = WORKSPACE / "state" / "projects"

try:
    from trajectory_logger import TrajectoryLogger, format_memory_check_card, SUMMARY_FILENAME
except Exception:  # pragma: no cover - restore must not depend on memory
    TrajectoryLogger = None
    format_memory_check_card = None
    SUMMARY_FILENAME = "trajectory_summary.md"

STAGE_NAMES = {
    1: "arxiv-search",
    2: "semantic-scholar",
    3: "paper-reader",
    4: "literature-synthesis",
    5: "research-planner",
    6: "report-writer",
    7: "claim-auditor",
    8: "paper-reviewer",
    9: "science-slides",
}

STATUS_ICONS = {
    "pending":     "⬜",
    "in_progress": "🔄",
    "done":        "✅",
    "failed":      "❌",
    "skipped":     "⏭️ ",
}


def load_state(proj_dir: Path) -> dict:
    ps_path = proj_dir / "pipeline_state.json"
    if not ps_path.exists():
        print("❌ pipeline_state.json 不存在，请先运行 init_project.py", file=sys.stderr)
        sys.exit(1)
    return json.loads(ps_path.read_text(encoding="utf-8"))


def load_evidence_count(proj_dir: Path) -> int:
    ev_path = proj_dir / "evidence.json"
    if not ev_path.exists():
        return 0
    ev = json.loads(ev_path.read_text(encoding="utf-8"))
    return len(ev.get("items", []))


def load_memory_stats(proj_dir: Path) -> dict:
    mem_path = proj_dir / "evidence_memory.json"
    if not mem_path.exists():
        return {"cards": 0, "high": 0, "unsupported": 0, "conflicts": 0}
    memory = json.loads(mem_path.read_text(encoding="utf-8"))
    cards = memory.get("cards", [])
    conflicts = 0
    for card in cards:
        for relation in card.get("relations", []):
            if relation.get("type") == "Contradict" or relation.get("relation") == "Contradict":
                conflicts += 1
    return {
        "cards": len(cards),
        "high": sum(1 for c in cards if c.get("confidence") == "high"),
        "unsupported": sum(1 for c in cards if c.get("audit_result") == "unsupported"),
        "conflicts": conflicts,
    }


def format_ts(ts: str) -> str:
    if not ts:
        return "未知"
    return ts[:19].replace("T", " ")


def run_doctor() -> None:
    """Run workspace_doctor; print warnings but don't abort session restore."""
    import subprocess
    doctor = Path(__file__).parent / "workspace_doctor.py"
    result = subprocess.run(
        [sys.executable, str(doctor)],
        capture_output=True, text=True, encoding="utf-8"
    )
    if result.returncode != 0:
        print(result.stdout.strip())
        print()  # blank line before the restore card


def load_trajectory_prompt_context(proj_dir: Path, n: int = 3) -> str:
    blocks = []
    files_read = []
    reuse_context_path = proj_dir / "trajectory_context.md"
    if reuse_context_path.exists():
        try:
            reuse_context = reuse_context_path.read_text(encoding="utf-8")
            files_read.append(str(reuse_context_path.relative_to(WORKSPACE)))
            if len(reuse_context) > 2400:
                reuse_context = reuse_context[:2400].rstrip() + "\n... [truncated]"
            blocks.append("Reusable Project Trajectory Context:")
            blocks.append(reuse_context)
        except Exception as exc:
            blocks.append(f"Reusable Project Trajectory Context: unavailable ({exc}).")

    summary_path = proj_dir / SUMMARY_FILENAME
    if summary_path.exists():
        try:
            summary_context = summary_path.read_text(encoding="utf-8-sig", errors="replace")
            files_read.append(str(summary_path.relative_to(WORKSPACE)))
            if len(summary_context) > 3600:
                summary_context = summary_context[:3600].rstrip() + "\n... [truncated]"
            blocks.append("Compressed Current Project Trajectory Summary:")
            blocks.append(summary_context)
        except Exception as exc:
            blocks.append(f"Compressed Current Project Trajectory Summary: unavailable ({exc}).")

    if TrajectoryLogger is None:
        blocks.append("Trajectory Memory: unavailable.")
        return "\n\n".join(blocks)
    try:
        logger = TrajectoryLogger(proj_dir)
        files_read.append(str((proj_dir / "trajectory_memory.jsonl").relative_to(WORKSPACE)))
        recent_records = logger.get_recent_records(n=n, include_memory_events=False)
        context = logger.get_recent_context(n=n, include_memory_events=False)
        if len(context) > 2400:
            context = context[:2400].rstrip() + "\n... [truncated]"
        blocks.append("Current Project Trajectory Memory:")
        blocks.append(context)
        retrieval_record = logger.log_memory_retrieval(
            requester_phase="Session_Restore",
            files_read=files_read,
            records_returned=len(recent_records),
            query={"recent_n": n, "project": proj_dir.name},
            observation=(
                f"Restored prompt context from {len(files_read)} memory source(s) "
                f"and {len(recent_records)} recent trajectory record(s)."
            ),
            reflection="Session restore memory retrieval is now visible as a trajectory step.",
        )
        blocks.append("Memory Retrieval Step Logged:")
        if format_memory_check_card is not None:
            blocks.append(format_memory_check_card(retrieval_record))
        else:
            blocks.append(
                f"{retrieval_record['phase']} step={retrieval_record['step']} "
                f"action={retrieval_record['action']['tool_name']} "
                f"files={retrieval_record['action']['parameters']['files_read']}"
            )
        return "\n\n".join(blocks)
    except Exception as exc:
        blocks.append(f"Trajectory Memory: unavailable ({exc}).")
        return "\n\n".join(blocks)


def main() -> None:
    if len(sys.argv) < 2:
        print("用法：python session_restore.py <slug>", file=sys.stderr)
        sys.exit(1)

    run_doctor()

    slug     = sys.argv[1]
    proj_dir = STATE_DIR / slug

    if not proj_dir.exists():
        print(f"❌ 项目不存在：{slug}", file=sys.stderr)
        sys.exit(1)

    ps = load_state(proj_dir)

    current_stage    = ps.get("current_stage", 1)
    mode             = ps.get("mode", "INTERACTIVE")
    stage_status     = ps.get("stage_status", {})
    gate_results     = ps.get("gate_results", {})
    improvement_cnt  = ps.get("improvement_counts", {})
    cons_confirms    = ps.get("consecutive_confirms", 0)
    passport         = ps.get("material_passport", [])
    created_at       = format_ts(ps.get("created_at", ""))
    last_updated     = format_ts(ps.get("last_updated", ""))
    pending_action   = ps.get("pending_action")
    ic               = ps.get("interactive_checkpoint")

    ev_count = load_evidence_count(proj_dir)
    mem_stats = load_memory_stats(proj_dir)

    stage_name = STAGE_NAMES.get(current_stage, f"stage-{current_stage}")

    # Determine checkpoint mode label
    if cons_confirms >= 2:
        cp_mode = "SLIM（已连续确认 ≥2 次）"
    else:
        cp_mode = "FULL"

    # Last gate result
    last_gate_key = f"after_{current_stage - 1}" if current_stage > 1 else None
    last_gate = gate_results.get(last_gate_key) if last_gate_key else None

    width = 58
    bar   = "═" * width

    print(f"\n╔{bar}╗")
    print(f"║  📦 项目恢复卡片  ·  {slug:<35}║")
    print(f"╠{bar}╣")
    print(f"║  🔄 模式：{mode:<10}  创建：{created_at}  ║")
    print(f"║  ⏱️  最后更新：{last_updated:<43}║")
    print(f"╠{bar}╣")

    # Current stage
    cur_status = stage_status.get(str(current_stage), "pending")
    cur_icon   = STATUS_ICONS.get(cur_status, "?")
    print(f"║  {cur_icon} 当前阶段：S{current_stage} {stage_name:<44}║")

    if pending_action:
        print(f"║  ⏸️  待处理动作：{str(pending_action)[:44]:<44}║")
    if ic:
        ic_str = str(ic)[:46]
        print(f"║  📋 上次检查点：{ic_str:<44}║")

    print(f"╠{bar}╣")

    # Stage progress strip
    print(f"║  阶段进度：", end="")
    for i in range(1, 10):
        st  = stage_status.get(str(i), "pending")
        ico = {"pending": "○", "in_progress": "●", "done": "✓", "failed": "✗", "skipped": "–"}.get(st, "?")
        print(f"S{i}:{ico} ", end="")
    print(f"{'':2}║")

    print(f"╠{bar}╣")

    # Evidence and gate summary
    print(f"║  📚 EV 记录数：{ev_count:<4}  🏛️  物料护照：{len(passport)} 条{'':<15}║")
    print(f"║  🧠 证据记忆：{mem_stats['cards']:<4}  高置信：{mem_stats['high']:<4}  未支持：{mem_stats['unsupported']:<4}{'':<15}║")
    print(f"║  🔥 Scientific Conflicts Identified: {mem_stats['conflicts']:<20}║")
    print(f"║  🔎 写作前建议：python scripts/evidence_memory.py {slug} query <topic>{'':<3}║")
    print(f"║  🔁 改进循环：{str(improvement_cnt)[:36]:<44}║")
    print(f"║  🎯 检查点模式：{cp_mode:<43}║")

    if last_gate:
        passed     = last_gate.get("passed", False)
        gate_icon  = "✅" if passed else "❌"
        gate_stage = current_stage - 1
        gate_ts    = format_ts(last_gate.get("timestamp", ""))
        print(f"╠{bar}╣")
        print(f"║  最近门控结果：S{gate_stage} {gate_icon}  {'PASS' if passed else 'FAIL':<6}  {gate_ts:<24}║")
        if not passed:
            blockers = last_gate.get("blockers", [])
            for b in blockers[:2]:
                print(f"║     · {str(b)[:51]:<51}║")

    print(f"╠{bar}╣")

    # Next action prompt
    if cur_status == "done" or current_stage > 1:
        print(f"║  → 继续运行 S{current_stage} {stage_name}  {'':30}║")
    else:
        print(f"║  → 从 S{current_stage} {stage_name} 开始  {'':30}║")

    print(f"║  → 门控验证：python scripts/gate_check.py {slug} {current_stage:<14}║")
    print(f"╚{bar}╝\n")


    print("Trajectory Memory Context (inject into agent prompt):")
    print(load_trajectory_prompt_context(proj_dir, n=3))
    print()


if __name__ == "__main__":
    main()
