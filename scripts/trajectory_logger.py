# -*- coding: utf-8 -*-
"""
Append-only JSONL trajectory memory for phase-aware ReAct traces.

The memory file is always named ``trajectory_memory.jsonl`` and lives at the
workspace root passed to ``TrajectoryLogger``. Each line is one valid JSON
object so the log can be streamed, inspected, and recovered without loading the
whole file into memory.
"""

from __future__ import annotations

import json
import os
import sys
import argparse
from collections import deque
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Deque, Dict, Iterator, Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


MEMORY_FILENAME = "trajectory_memory.jsonl"
MEMORY_RETRIEVE_PHASE = "Memory_Retrieve"
MEMORY_STORE_PHASE = "Memory_Store"


def _clip(text: str, limit: int = 1600) -> str:
    text = str(text)
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "\n... [truncated]"


def _json_compact(value: Any, limit: int = 800) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    except TypeError:
        text = str(value)
    return _clip(text, limit=limit)


def format_memory_check_card(record: Dict[str, Any], context: str = "") -> str:
    """Format a Memory_Retrieve record as a user-facing interaction card."""

    action = record.get("action") if isinstance(record.get("action"), dict) else {}
    params = action.get("parameters", {}) if isinstance(action.get("parameters"), dict) else {}
    files = params.get("files_read", [])
    lines = [
        "MEMORY CHECK CARD",
        "",
        f"阶段: {params.get('requester_phase', '')}",
        f"Memory step: {record.get('phase', '')} step={record.get('step', '')}",
        f"Action: {action.get('tool_name', '')}",
        "",
        "读取记忆:",
    ]
    if files:
        lines.extend(f"- {item}" for item in files)
    else:
        lines.append("- none")
    lines.extend([
        "",
        f"返回记录: {params.get('records_returned', 0)}",
        f"查询参数: {_json_compact(params.get('query', {}), limit=500)}",
        "",
        "使用约束:",
        "- trajectory memory 只作为 workflow prior",
        "- 论文事实、指标、引用仍必须来自 evidence.json",
    ])
    if context:
        lines.extend([
            "",
            "Recent memory preview:",
            _clip(context, limit=1600),
        ])
    return "\n".join(lines)


def format_memory_store_card(record: Dict[str, Any], store_record: Optional[Dict[str, Any]]) -> str:
    """Format a stored stage record and its Memory_Store event as a card."""

    action = record.get("action") if isinstance(record.get("action"), dict) else {}
    lines = [
        "TRAJECTORY ACTION CARD",
        "",
        f"阶段: {record.get('phase', '')}",
        f"Stage step: {record.get('phase', '')} step={record.get('step', '')}",
        f"Action: {action.get('tool_name', '')}",
        f"Observation: {_clip(record.get('observation', ''), limit=700)}",
    ]
    if record.get("reflection"):
        lines.append(f"Reflection: {_clip(record.get('reflection', ''), limit=500)}")

    lines.extend(["", "MEMORY STORE CARD", ""])
    if not store_record:
        lines.append("Memory store event: skipped")
        return "\n".join(lines)

    store_action = store_record.get("action") if isinstance(store_record.get("action"), dict) else {}
    params = store_action.get("parameters", {}) if isinstance(store_action.get("parameters"), dict) else {}
    lines.extend([
        f"Memory step: {store_record.get('phase', '')} step={store_record.get('step', '')}",
        f"Action: {store_action.get('tool_name', '')}",
        f"存储文件: {params.get('file', MEMORY_FILENAME)}",
        f"已存储阶段: {params.get('stored_phase', '')} step={params.get('stored_step', '')}",
        f"已存储动作: {params.get('stored_action', '')}",
        f"Observation: {_clip(store_record.get('observation', ''), limit=700)}",
    ])
    return "\n".join(lines)


class TrajectoryLoggerError(RuntimeError):
    """Raised when the trajectory memory cannot be read or written safely."""


@contextmanager
def _exclusive_file_lock(handle):
    """Best-effort non-blocking exclusive lock for append writes."""

    locked = False
    if os.name == "nt":
        import msvcrt

        try:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            locked = True
            yield
        except OSError as exc:
            raise TrajectoryLoggerError(
                "trajectory_memory.jsonl is locked by another process"
            ) from exc
        finally:
            if locked:
                try:
                    handle.seek(0)
                    msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                except OSError:
                    pass
    else:
        import fcntl

        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            locked = True
            yield
        except OSError as exc:
            raise TrajectoryLoggerError(
                "trajectory_memory.jsonl is locked by another process"
            ) from exc
        finally:
            if locked:
                try:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
                except OSError:
                    pass


class TrajectoryLogger:
    """JSONL-backed, phase-aware ReAct trajectory memory."""

    def __init__(self, workspace_dir: str | Path):
        self.workspace_dir = Path(workspace_dir).expanduser().resolve()
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        self.log_path = self.workspace_dir / MEMORY_FILENAME
        self.log_path.touch(exist_ok=True)

    def log_step(
        self,
        phase: str,
        step: int,
        thought: str,
        action_name: str,
        action_params: Dict[str, Any],
        observation: str,
        reflection: str = "",
    ) -> Dict[str, Any]:
        """Append one ReAct trajectory record to trajectory_memory.jsonl."""

        if not isinstance(action_params, dict):
            raise TypeError("action_params must be a dictionary")

        record = {
            "timestamp": datetime.now().replace(microsecond=0).isoformat(),
            "phase": str(phase),
            "step": int(step),
            "thought": str(thought),
            "action": {
                "tool_name": str(action_name),
                "parameters": action_params,
            },
            "observation": str(observation),
            "reflection": str(reflection),
        }

        line = json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n"
        try:
            with self.log_path.open("a+", encoding="utf-8", newline="\n") as handle:
                with _exclusive_file_lock(handle):
                    handle.write(line)
                    handle.flush()
                    os.fsync(handle.fileno())
        except TrajectoryLoggerError:
            raise
        except OSError as exc:
            raise TrajectoryLoggerError(
                f"failed to append trajectory memory: {exc}"
            ) from exc

        return record

    def get_recent_context(self, phase: Optional[str] = None, n: int = 5) -> str:
        """Return the latest n trajectory records as prompt-ready plain text."""

        if n <= 0:
            return "Trajectory Memory: no records requested."

        recent = self.get_recent_records(phase=phase, n=n)

        if not recent:
            phase_label = f" for phase {phase}" if phase else ""
            return f"Trajectory Memory: no records found{phase_label}."

        header = f"Trajectory Memory Context (latest {len(recent)}"
        header += f" records for phase {phase}" if phase else " records"
        header += ")"

        blocks = [header]
        for record in recent:
            action = record.get("action") or {}
            params = json.dumps(
                action.get("parameters", {}),
                ensure_ascii=False,
                sort_keys=True,
            )
            block = [
                f"- [{record.get('timestamp', '')}] {record.get('phase', '')} step={record.get('step', '')}",
                f"  Thought: {record.get('thought', '')}",
                f"  Action: {action.get('tool_name', '')}({params})",
                f"  Observation: {record.get('observation', '')}",
            ]
            reflection = record.get("reflection", "")
            if reflection:
                block.append(f"  Reflection: {reflection}")
            blocks.append("\n".join(block))

        return "\n\n".join(blocks)

    def get_recent_records(
        self,
        phase: Optional[str] = None,
        n: int = 5,
        include_memory_events: bool = True,
    ) -> list[Dict[str, Any]]:
        """Return the latest n records without loading the whole JSONL file."""

        if n <= 0:
            return []

        recent: Deque[Dict[str, Any]] = deque(maxlen=n)
        for record in self._iter_records():
            record_phase = record.get("phase")
            if not include_memory_events and record_phase in {MEMORY_RETRIEVE_PHASE, MEMORY_STORE_PHASE}:
                continue
            if phase is None or record_phase == phase:
                recent.append(record)
        return list(recent)

    def log_memory_retrieval(
        self,
        requester_phase: str,
        files_read: list[str],
        records_returned: int,
        query: Optional[Dict[str, Any]] = None,
        observation: str = "",
        reflection: str = "",
    ) -> Dict[str, Any]:
        """Log a visible step describing trajectory memory retrieval."""

        files = [str(item) for item in files_read]
        return self.log_step(
            phase=MEMORY_RETRIEVE_PHASE,
            step=self.get_next_step(MEMORY_RETRIEVE_PHASE),
            thought=f"Retrieve trajectory memory before {requester_phase} so prior workflow context is visible and auditable.",
            action_name="trajectory_memory.retrieve",
            action_params={
                "requester_phase": str(requester_phase),
                "files_read": files,
                "records_returned": int(records_returned),
                "query": query or {},
            },
            observation=observation or f"Read {len(files)} memory source(s) and returned {records_returned} record(s).",
            reflection=reflection or "Memory retrieval was logged as a first-class trajectory step for UI/workspace inspection.",
        )

    def log_memory_store(
        self,
        stored_record: Dict[str, Any],
        requester_phase: Optional[str] = None,
        reflection: str = "",
    ) -> Optional[Dict[str, Any]]:
        """Log a visible step describing that a trajectory record was stored."""

        stored_phase = str(stored_record.get("phase", ""))
        if stored_phase == MEMORY_STORE_PHASE:
            return None
        action = stored_record.get("action") if isinstance(stored_record.get("action"), dict) else {}
        return self.log_step(
            phase=MEMORY_STORE_PHASE,
            step=self.get_next_step(MEMORY_STORE_PHASE),
            thought=f"Persist the completed {stored_phase} trajectory step so future sessions can restore it.",
            action_name="trajectory_memory.store",
            action_params={
                "requester_phase": str(requester_phase or stored_phase),
                "file": MEMORY_FILENAME,
                "stored_phase": stored_phase,
                "stored_step": stored_record.get("step"),
                "stored_action": action.get("tool_name", ""),
                "stored_timestamp": stored_record.get("timestamp", ""),
            },
            observation=(
                f"Stored {stored_phase} step={stored_record.get('step')} "
                f"action={action.get('tool_name', '')} in {MEMORY_FILENAME}."
            ),
            reflection=reflection or "Storage of the trajectory step is now itself visible in the project memory timeline.",
        )

    def get_timeline_context(self, n: int = 20) -> str:
        """Return a compact human-facing timeline including memory IO events."""

        records = self.get_recent_records(n=n, include_memory_events=True)
        if not records:
            return "Trajectory Timeline: no records found."

        blocks = [f"Trajectory Timeline (latest {len(records)} records)"]
        for record in records:
            action = record.get("action") if isinstance(record.get("action"), dict) else {}
            params = action.get("parameters", {}) if isinstance(action.get("parameters"), dict) else {}
            phase = record.get("phase", "")
            label = "memory read" if phase == MEMORY_RETRIEVE_PHASE else "memory write" if phase == MEMORY_STORE_PHASE else "stage action"
            detail = record.get("observation", "")
            if phase == MEMORY_RETRIEVE_PHASE:
                detail = (
                    f"read={params.get('files_read', [])}; "
                    f"returned={params.get('records_returned', 0)}; "
                    f"requester={params.get('requester_phase', '')}"
                )
            elif phase == MEMORY_STORE_PHASE:
                detail = (
                    f"stored={params.get('stored_phase', '')} step={params.get('stored_step', '')}; "
                    f"action={params.get('stored_action', '')}"
                )
            blocks.append(
                "\n".join([
                    f"- [{record.get('timestamp', '')}] {phase} step={record.get('step', '')} ({label})",
                    f"  Action: {action.get('tool_name', '')}",
                    f"  {detail}",
                ])
            )
        return "\n\n".join(blocks)

    def get_last_state(self) -> Optional[Dict[str, Any]]:
        """Return the last valid JSONL record, or None if memory is empty."""

        last: Optional[Dict[str, Any]] = None
        for record in self._iter_records():
            last = record
        return last

    def get_next_step(self, phase: str) -> int:
        """Return the next monotonically increasing step for a phase."""

        max_step = 0
        for record in self._iter_records():
            if record.get("phase") != phase:
                continue
            try:
                max_step = max(max_step, int(record.get("step", 0)))
            except (TypeError, ValueError):
                continue
        return max_step + 1

    def _iter_records(self) -> Iterator[Dict[str, Any]]:
        """Stream valid JSONL records while skipping malformed lines."""

        try:
            with self.log_path.open("r", encoding="utf-8-sig") as handle:
                for line_number, line in enumerate(handle, start=1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        record = json.loads(line)
                    except json.JSONDecodeError as exc:
                        print(
                            f"warning: skipped malformed JSONL line {line_number}: {exc}",
                            file=sys.stderr,
                        )
                        continue
                    if isinstance(record, dict):
                        yield record
                    else:
                        print(
                            f"warning: skipped non-object JSONL line {line_number}",
                            file=sys.stderr,
                        )
        except FileNotFoundError:
            return
        except OSError as exc:
            raise TrajectoryLoggerError(
                f"failed to read trajectory memory: {exc}"
            ) from exc


# Integration example for an agent main loop:
#
# from pathlib import Path
# from scripts.trajectory_logger import TrajectoryLogger
#
# logger = TrajectoryLogger(Path(__file__).resolve().parent.parent)
# phase = "S1_ArxivSearch"
# step = 1
# recent_context = logger.get_recent_context(phase=phase, n=3)
# thought = (
#     "Need seed literature before planning. Use recent trajectory context to "
#     "avoid repeating failed search terms:\n" + recent_context
# )
# results = arxiv_search(query="retrieval augmented generation hallucination")
# logger.log_step(
#     phase=phase,
#     step=step,
#     thought=thought,
#     action_name="arxiv_search",
#     action_params={"query": "retrieval augmented generation hallucination"},
#     observation=f"Found {len(results)} candidate papers.",
#     reflection="Search returned enough candidates for triage.",
# )
#
# On session restore:
# last_state = logger.get_last_state()
# if last_state:
#     print(f"Resume from {last_state['phase']} step {last_state['step']}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Read or append project-local JSONL trajectory memory."
    )
    parser.add_argument(
        "workspace_dir",
        nargs="?",
        default=".",
        help="Project workspace directory that contains trajectory_memory.jsonl.",
    )
    subparsers = parser.add_subparsers(dest="command")

    recent_parser = subparsers.add_parser("recent", help="Print recent prompt context.")
    recent_parser.add_argument("--phase", default=None)
    recent_parser.add_argument("--n", type=int, default=5)

    retrieve_parser = subparsers.add_parser(
        "retrieve",
        help="Print recent context and append a Memory_Retrieve step.",
    )
    retrieve_parser.add_argument("--phase", default=None)
    retrieve_parser.add_argument("--n", type=int, default=5)
    retrieve_parser.add_argument("--requester-phase", default="Manual")
    retrieve_parser.add_argument(
        "--source",
        action="append",
        default=[],
        help="Memory source file that was considered. May be repeated.",
    )
    retrieve_parser.add_argument(
        "--output",
        choices=["card", "json", "both"],
        default="both",
        help="Output format for the retrieval event.",
    )

    timeline_parser = subparsers.add_parser(
        "timeline",
        help="Print a compact timeline including memory retrieve/store steps.",
    )
    timeline_parser.add_argument("--n", type=int, default=20)

    subparsers.add_parser("last", help="Print the last valid JSONL record.")

    log_parser = subparsers.add_parser("log", help="Append one trajectory step.")
    log_parser.add_argument("--phase", required=True)
    log_parser.add_argument("--step", type=int, default=None)
    log_parser.add_argument("--thought", required=True)
    log_parser.add_argument("--action-name", required=True)
    log_parser.add_argument("--action-params-json", default="{}")
    log_parser.add_argument(
        "--action-param",
        action="append",
        default=[],
        help="Additional action parameter as key=value. May be repeated.",
    )
    log_parser.add_argument("--observation", required=True)
    log_parser.add_argument("--reflection", default="")
    log_parser.add_argument(
        "--no-store-event",
        action="store_true",
        help="Do not append a Memory_Store bookkeeping step after this log.",
    )
    log_parser.add_argument(
        "--output",
        choices=["card", "json", "both"],
        default="both",
        help="Output format for the log/store event.",
    )

    args = parser.parse_args()
    logger = TrajectoryLogger(args.workspace_dir)

    if args.command in (None, "recent"):
        phase = getattr(args, "phase", None)
        n = getattr(args, "n", 5)
        print(f"Trajectory memory file: {logger.log_path}")
        print(logger.get_recent_context(phase=phase, n=n))
        return

    if args.command == "retrieve":
        phase = getattr(args, "phase", None)
        n = getattr(args, "n", 5)
        records = logger.get_recent_records(phase=phase, n=n)
        context = logger.get_recent_context(phase=phase, n=n)
        files_read = list(args.source or [])
        if not files_read:
            files_read = [MEMORY_FILENAME]
        retrieval = logger.log_memory_retrieval(
            requester_phase=args.requester_phase,
            files_read=files_read,
            records_returned=len(records),
            query={"phase": phase, "n": n},
        )
        if args.output in ("card", "both"):
            print(format_memory_check_card(retrieval, context=context))
        if args.output == "both":
            print("\n--- JSON ---")
        if args.output in ("json", "both"):
            print(json.dumps({
                "trajectory_memory_file": str(logger.log_path),
                "context": context,
                "memory_retrieval_record": retrieval,
            }, ensure_ascii=False, indent=2))
        return

    if args.command == "timeline":
        print(logger.get_timeline_context(n=args.n))
        return

    if args.command == "last":
        last_state = logger.get_last_state()
        print(json.dumps(last_state, ensure_ascii=False, indent=2) if last_state else "null")
        return

    if args.command == "log":
        try:
            action_params = json.loads(args.action_params_json)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"invalid --action-params-json: {exc}") from exc
        if not isinstance(action_params, dict):
            raise SystemExit("--action-params-json must decode to an object")
        for item in args.action_param:
            if "=" not in item:
                raise SystemExit(f"invalid --action-param, expected key=value: {item}")
            key, value = item.split("=", 1)
            key = key.strip()
            if not key:
                raise SystemExit(f"invalid --action-param with empty key: {item}")
            try:
                action_params[key] = json.loads(value)
            except json.JSONDecodeError:
                action_params[key] = value
        step = args.step if args.step is not None else logger.get_next_step(args.phase)
        record = logger.log_step(
            phase=args.phase,
            step=step,
            thought=args.thought,
            action_name=args.action_name,
            action_params=action_params,
            observation=args.observation,
            reflection=args.reflection,
        )
        store_record = None
        if not args.no_store_event and args.phase != MEMORY_STORE_PHASE:
            store_record = logger.log_memory_store(record, requester_phase=args.phase)
        if args.output in ("card", "both"):
            print(format_memory_store_card(record, store_record))
        if args.output == "both":
            print("\n--- JSON ---")
        if args.output in ("json", "both"):
            print(json.dumps({
                "record": record,
                "memory_store_record": store_record,
            }, ensure_ascii=False, indent=2))
        return


if __name__ == "__main__":
    main()
