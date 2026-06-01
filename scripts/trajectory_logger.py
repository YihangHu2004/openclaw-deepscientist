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

        recent: Deque[Dict[str, Any]] = deque(maxlen=n)
        for record in self._iter_records():
            if phase is None or record.get("phase") == phase:
                recent.append(record)

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

    args = parser.parse_args()
    logger = TrajectoryLogger(args.workspace_dir)

    if args.command in (None, "recent"):
        phase = getattr(args, "phase", None)
        n = getattr(args, "n", 5)
        print(f"Trajectory memory file: {logger.log_path}")
        print(logger.get_recent_context(phase=phase, n=n))
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
        print(json.dumps(record, ensure_ascii=False, indent=2))
        return


if __name__ == "__main__":
    main()
