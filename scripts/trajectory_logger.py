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
from collections import Counter, deque
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Deque, Dict, Iterator, Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


MEMORY_FILENAME = "trajectory_memory.jsonl"
SUMMARY_FILENAME = "trajectory_summary.md"
MEMORY_RETRIEVE_PHASE = "Memory_Retrieve"
MEMORY_STORE_PHASE = "Memory_Store"
MEMORY_COMPACT_PHASE = "Memory_Compact"


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


def format_memory_compact_card(record: Dict[str, Any], summary_path: Path, preview: str = "") -> str:
    """Format a Memory_Compact record as a visible compression card."""

    action = record.get("action") if isinstance(record.get("action"), dict) else {}
    params = action.get("parameters", {}) if isinstance(action.get("parameters"), dict) else {}
    lines = [
        "CONTEXT COMPRESSION CARD",
        "",
        f"Memory step: {record.get('phase', '')} step={record.get('step', '')}",
        f"Action: {action.get('tool_name', '')}",
        f"Summary file: {summary_path.name}",
        f"Records scanned: {params.get('records_scanned', 0)}",
        f"Recent tail kept: {params.get('keep_recent', 0)}",
        f"Max summary chars: {params.get('max_chars', 0)}",
        "",
        "Compression policy:",
        "- preserve raw trajectory_memory.jsonl as append-only audit log",
        "- compact old trajectory into phase-aware workflow summary",
        "- keep recent uncompressed tail for local continuity",
        "- use compressed memory as workflow prior only, never as evidence",
    ]
    if preview:
        lines.extend(["", "Summary preview:", _clip(preview, limit=1600)])
    return "\n".join(lines)


def _record_action(record: Dict[str, Any]) -> Dict[str, Any]:
    action = record.get("action")
    return action if isinstance(action, dict) else {}


def _record_text(record: Dict[str, Any]) -> str:
    action = _record_action(record)
    params = action.get("parameters", {}) if isinstance(action.get("parameters"), dict) else {}
    return "\n".join(
        str(part)
        for part in [
            record.get("phase", ""),
            record.get("thought", ""),
            action.get("tool_name", ""),
            _json_compact(params, limit=500),
            record.get("observation", ""),
            record.get("reflection", ""),
        ]
        if part
    )


def _short_record_line(record: Dict[str, Any], limit: int = 260) -> str:
    action = _record_action(record)
    text = record.get("reflection") or record.get("observation") or record.get("thought") or ""
    return (
        f"[{record.get('timestamp', '')}] {record.get('phase', '')} "
        f"step={record.get('step', '')} action={action.get('tool_name', '')}: "
        f"{_clip(text, limit=limit)}"
    )


def _contains_any(text: str, needles: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(item in lowered for item in needles)


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

    def get_recent_context(
        self,
        phase: Optional[str] = None,
        n: int = 5,
        include_memory_events: bool = True,
    ) -> str:
        """Return the latest n trajectory records as prompt-ready plain text."""

        if n <= 0:
            return "Trajectory Memory: no records requested."

        recent = self.get_recent_records(
            phase=phase,
            n=n,
            include_memory_events=include_memory_events,
        )

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
            if not include_memory_events and record_phase in {
                MEMORY_RETRIEVE_PHASE,
                MEMORY_STORE_PHASE,
                MEMORY_COMPACT_PHASE,
            }:
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
            label = (
                "memory read"
                if phase == MEMORY_RETRIEVE_PHASE
                else "memory write"
                if phase == MEMORY_STORE_PHASE
                else "memory compact"
                if phase == MEMORY_COMPACT_PHASE
                else "stage action"
            )
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
            elif phase == MEMORY_COMPACT_PHASE:
                detail = (
                    f"summary={params.get('summary_file', SUMMARY_FILENAME)}; "
                    f"records={params.get('records_scanned', 0)}; "
                    f"tail={params.get('keep_recent', 0)}"
                )
            blocks.append(
                "\n".join([
                    f"- [{record.get('timestamp', '')}] {phase} step={record.get('step', '')} ({label})",
                    f"  Action: {action.get('tool_name', '')}",
                    f"  {detail}",
                ])
            )
        return "\n\n".join(blocks)

    def get_compressed_context(
        self,
        recent_n: int = 5,
        summary_chars: int = 6000,
        include_recent: bool = True,
    ) -> str:
        """
        Return prompt-ready compressed context plus a recent uncompressed tail.

        This mirrors the context-compaction pattern used by coding agents:
        old interaction history is summarized into a bounded durable file, while
        the latest raw steps are kept verbatim for local continuity.
        """

        blocks: list[str] = []
        summary_path = self.workspace_dir / SUMMARY_FILENAME
        if summary_path.exists():
            try:
                summary = summary_path.read_text(encoding="utf-8-sig", errors="replace")
                if len(summary) > summary_chars:
                    summary = summary[:summary_chars].rstrip() + "\n... [truncated]"
                blocks.extend(["Compressed Trajectory Memory:", summary])
            except OSError as exc:
                blocks.append(f"Compressed Trajectory Memory: unavailable ({exc}).")
        else:
            blocks.append("Compressed Trajectory Memory: no trajectory_summary.md found.")

        if include_recent:
            blocks.extend(
                [
                    "",
                    "Recent Uncompressed Trajectory Tail:",
                    self.get_recent_context(n=recent_n, include_memory_events=False),
                ]
            )
        return "\n\n".join(blocks)

    def compact_context(
        self,
        keep_recent: int = 8,
        max_records: Optional[int] = None,
        max_chars: int = 9000,
        phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Stream trajectory_memory.jsonl and write trajectory_summary.md.

        The compactor is deterministic and extractive: it does not call an LLM.
        It keeps counts, latest phase states, durable lessons, failure patterns,
        constraints, and a small raw tail. Raw JSONL remains append-only.
        """

        if keep_recent < 0:
            raise ValueError("keep_recent must be >= 0")
        if max_records is not None and max_records <= 0:
            raise ValueError("max_records must be positive when provided")

        summary_path = self.workspace_dir / SUMMARY_FILENAME
        phase_stats: Dict[str, Dict[str, Any]] = {}
        action_counts: Counter[str] = Counter()
        memory_io_counts: Counter[str] = Counter()
        durable_decisions: Deque[str] = deque(maxlen=12)
        workflow_lessons: Deque[str] = deque(maxlen=16)
        failure_patterns: Deque[str] = deque(maxlen=12)
        constraints: Deque[str] = deque(maxlen=12)
        next_actions: Deque[str] = deque(maxlen=10)
        recent_tail: Deque[Dict[str, Any]] = deque(maxlen=keep_recent)

        total_seen = 0
        total_used = 0
        last_record: Optional[Dict[str, Any]] = None
        last_meaningful_record: Optional[Dict[str, Any]] = None
        memory_event_phases = {
            MEMORY_RETRIEVE_PHASE,
            MEMORY_STORE_PHASE,
            MEMORY_COMPACT_PHASE,
        }

        for record in self._iter_records():
            total_seen += 1
            if phase is not None and record.get("phase") != phase:
                continue
            if max_records is not None and total_used >= max_records:
                break

            total_used += 1
            last_record = record
            recent_tail.append(record)
            record_phase = str(record.get("phase", ""))
            is_memory_event = record_phase in memory_event_phases
            if not is_memory_event:
                last_meaningful_record = record
            action = _record_action(record)
            action_name = str(action.get("tool_name", ""))
            if action_name and not is_memory_event:
                action_counts[action_name] += 1
            if is_memory_event:
                memory_io_counts[record_phase] += 1

            stats = phase_stats.setdefault(
                record_phase,
                {
                    "records": 0,
                    "last_step": "",
                    "last_timestamp": "",
                    "last_action": "",
                    "last_observation": "",
                    "last_reflection": "",
                },
            )
            stats["records"] += 1
            stats["last_step"] = record.get("step", "")
            stats["last_timestamp"] = record.get("timestamp", "")
            stats["last_action"] = action_name
            stats["last_observation"] = _clip(record.get("observation", ""), limit=220)
            stats["last_reflection"] = _clip(record.get("reflection", ""), limit=220)

            text = _record_text(record)
            line = _short_record_line(record)
            if is_memory_event:
                continue
            if _contains_any(
                text,
                (
                    "decide",
                    "decision",
                    "selected",
                    "choose",
                    "chosen",
                    "gate passed",
                    "initialized",
                    "created",
                    "确定",
                    "选择",
                    "门控通过",
                    "初始化完成",
                ),
            ):
                durable_decisions.append(line)
            if record.get("reflection"):
                workflow_lessons.append(line)
            if _contains_any(
                text,
                (
                    "error",
                    "failed",
                    "failure",
                    "timeout",
                    "empty",
                    "no result",
                    "no reusable",
                    "unsupported",
                    "drifted",
                    "blocked",
                    "报错",
                    "失败",
                    "超时",
                    "无结果",
                    "不支持",
                ),
            ):
                failure_patterns.append(line)
            if _contains_any(
                text,
                (
                    "must",
                    "never",
                    "constraint",
                    "require",
                    "evidence.json",
                    "workflow prior",
                    "do not",
                    "必须",
                    "不能",
                    "约束",
                    "证据",
                ),
            ):
                constraints.append(line)
            if _contains_any(
                text,
                (
                    "next",
                    "continue",
                    "pending",
                    "todo",
                    "resume",
                    "进入",
                    "下一步",
                    "继续",
                    "待",
                ),
            ):
                next_actions.append(line)

        generated_at = datetime.now().replace(microsecond=0).isoformat()
        lines = [
            "# Trajectory Context Summary",
            "",
            f"Generated: {generated_at}",
            f"Source: {MEMORY_FILENAME}",
            f"Records scanned: {total_seen}",
            f"Records summarized: {total_used}",
            f"Phase filter: {phase or 'all'}",
            "",
            "Use policy:",
            "- This file is compressed workflow memory, not scientific evidence.",
            "- Keep raw trajectory_memory.jsonl as the append-only audit log.",
            "- Use this summary to restore intent, constraints, failed attempts, and next workflow moves.",
            "- Claims about papers, datasets, metrics, or citations still require evidence.json.",
        ]

        display_last_record = last_meaningful_record or last_record
        if display_last_record:
            action = _record_action(display_last_record)
            lines.extend(
                [
                    "",
                    "## Last Known State",
                    f"- timestamp: {display_last_record.get('timestamp', '')}",
                    f"- phase: {display_last_record.get('phase', '')}",
                    f"- step: {display_last_record.get('step', '')}",
                    f"- action: {action.get('tool_name', '')}",
                    f"- observation: {_clip(display_last_record.get('observation', ''), limit=420)}",
                ]
            )
            if display_last_record.get("reflection"):
                lines.append(f"- reflection: {_clip(display_last_record.get('reflection', ''), limit=420)}")

        lines.extend(["", "## Phase-Aware Progress"])
        if phase_stats:
            progress_items = 0
            for item_phase, stats in sorted(phase_stats.items()):
                if item_phase in memory_event_phases:
                    continue
                progress_items += 1
                lines.append(
                    f"- {item_phase}: records={stats['records']}, "
                    f"last_step={stats['last_step']}, last_action={stats['last_action']}"
                )
                if stats["last_observation"]:
                    lines.append(f"  last_observation: {stats['last_observation']}")
                if stats["last_reflection"]:
                    lines.append(f"  last_reflection: {stats['last_reflection']}")
            if progress_items == 0:
                lines.append("- no non-memory stage records available")
        else:
            lines.append("- no records available")

        if action_counts:
            lines.extend(["", "## Tool/Action Frequency"])
            for name, count in action_counts.most_common(12):
                lines.append(f"- {name}: {count}")

        if memory_io_counts:
            lines.extend(["", "## Memory IO Summary"])
            for name, count in memory_io_counts.most_common():
                lines.append(f"- {name}: {count}")

        def add_section(title: str, items: Deque[str]) -> None:
            lines.extend(["", f"## {title}"])
            if items:
                lines.extend(f"- {item}" for item in items)
            else:
                lines.append("- none captured")

        add_section("Durable Decisions", durable_decisions)
        add_section("Reusable Workflow Lessons", workflow_lessons)
        add_section("Failure And Retry Patterns", failure_patterns)
        add_section("Persistent Constraints", constraints)
        add_section("Likely Next Actions", next_actions)

        lines.extend(["", "## Recent Uncompressed Tail"])
        if recent_tail:
            lines.extend(f"- {_short_record_line(record, limit=300)}" for record in recent_tail)
        else:
            lines.append("- none")

        summary = "\n".join(lines).strip() + "\n"
        if len(summary) > max_chars:
            summary = summary[:max_chars].rstrip() + "\n... [truncated]\n"

        tmp_path = summary_path.with_suffix(summary_path.suffix + ".tmp")
        try:
            tmp_path.write_text(summary, encoding="utf-8", newline="\n")
            tmp_path.replace(summary_path)
        except OSError as exc:
            raise TrajectoryLoggerError(f"failed to write {SUMMARY_FILENAME}: {exc}") from exc

        return {
            "summary_path": summary_path,
            "summary": summary,
            "generated_at": generated_at,
            "records_seen": total_seen,
            "records_summarized": total_used,
            "phase_count": len(phase_stats),
            "keep_recent": keep_recent,
            "max_chars": max_chars,
            "phase_filter": phase,
            "last_state": display_last_record,
        }

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

    compressed_parser = subparsers.add_parser(
        "compressed",
        help="Print trajectory_summary.md plus a recent uncompressed tail.",
    )
    compressed_parser.add_argument("--recent-n", type=int, default=5)
    compressed_parser.add_argument("--summary-chars", type=int, default=6000)
    compressed_parser.add_argument(
        "--no-recent",
        action="store_true",
        help="Only print trajectory_summary.md, without recent JSONL tail.",
    )

    compact_parser = subparsers.add_parser(
        "compact",
        help="Compress long trajectory memory into trajectory_summary.md.",
    )
    compact_parser.add_argument("--keep-recent", type=int, default=8)
    compact_parser.add_argument("--max-records", type=int, default=None)
    compact_parser.add_argument("--max-chars", type=int, default=9000)
    compact_parser.add_argument("--phase", default=None)
    compact_parser.add_argument(
        "--no-log-event",
        action="store_true",
        help="Write trajectory_summary.md without appending a Memory_Compact record.",
    )
    compact_parser.add_argument(
        "--output",
        choices=["card", "json", "both"],
        default="both",
        help="Output format for the compaction event.",
    )

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

    if args.command == "compressed":
        print(
            logger.get_compressed_context(
                recent_n=args.recent_n,
                summary_chars=args.summary_chars,
                include_recent=not args.no_recent,
            )
        )
        return

    if args.command == "compact":
        result = logger.compact_context(
            keep_recent=args.keep_recent,
            max_records=args.max_records,
            max_chars=args.max_chars,
            phase=args.phase,
        )
        compact_record = None
        if not args.no_log_event:
            compact_record = logger.log_step(
                phase=MEMORY_COMPACT_PHASE,
                step=logger.get_next_step(MEMORY_COMPACT_PHASE),
                thought=(
                    "Compress older trajectory memory into a bounded summary "
                    "while preserving the raw append-only JSONL log."
                ),
                action_name="trajectory_memory.compact",
                action_params={
                    "source_file": MEMORY_FILENAME,
                    "summary_file": SUMMARY_FILENAME,
                    "records_scanned": result["records_seen"],
                    "records_summarized": result["records_summarized"],
                    "phase_count": result["phase_count"],
                    "keep_recent": result["keep_recent"],
                    "max_chars": result["max_chars"],
                    "phase_filter": result["phase_filter"],
                },
                observation=(
                    f"Wrote {SUMMARY_FILENAME} from {result['records_summarized']} "
                    f"trajectory record(s); kept {result['keep_recent']} recent raw tail item(s)."
                ),
                reflection=(
                    "Future restore/reuse should read trajectory_summary.md first, "
                    "then append recent uncompressed trajectory context."
                ),
            )
        if args.output in ("card", "both"):
            if compact_record:
                print(
                    format_memory_compact_card(
                        compact_record,
                        summary_path=result["summary_path"],
                        preview=result["summary"],
                    )
                )
            else:
                print(f"Wrote {result['summary_path']}")
                print(_clip(result["summary"], limit=1600))
        if args.output == "both":
            print("\n--- JSON ---")
        if args.output in ("json", "both"):
            printable = dict(result)
            printable["summary_path"] = str(printable["summary_path"])
            print(json.dumps({
                "compaction": printable,
                "memory_compact_record": compact_record,
            }, ensure_ascii=False, indent=2))
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
