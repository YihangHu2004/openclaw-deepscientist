# -*- coding: utf-8 -*-
"""
Project-local trajectory reuse by keyword similarity.

This module ranks existing projects against a new project query, then extracts
small prompt-ready snippets from each matched project's trajectory_memory.jsonl.
It never creates or depends on a global trajectory ledger.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


WORKSPACE = Path(__file__).parent.parent
DEFAULT_PROJECTS_DIR = WORKSPACE / "state" / "projects"
MEMORY_FILENAME = "trajectory_memory.jsonl"

STOPWORDS = {
    "the", "and", "for", "with", "from", "that", "this", "into", "about",
    "are", "was", "were", "been", "being", "than", "then", "have", "has",
    "had", "not", "can", "could", "would", "should", "will", "shall",
    "project", "research", "study", "survey", "review", "paper", "papers",
    "method", "methods", "model", "models", "system", "systems", "using",
    "based", "task", "tasks", "result", "results", "analysis", "new",
    "trajectory", "memory", "context", "workflow", "reuse", "source",
    "target", "test", "verify", "demo", "example",
}


@dataclass(frozen=True)
class ReuseCandidate:
    slug: str
    score: float
    shared_keywords: list[str]
    memory_path: Path
    recent_records: list[dict[str, Any]]


def read_text_safe(path: Path, limit: int = 40000) -> str:
    """Read at most limit characters from a text file."""

    try:
        with path.open("r", encoding="utf-8-sig", errors="replace") as handle:
            return handle.read(limit)
    except OSError:
        return ""


def normalize_keyword(raw: str) -> str:
    return raw.strip().lower().replace("_", "-")


def extract_keywords(text: str) -> Counter[str]:
    """
    Extract rough multilingual keywords without external dependencies.

    English-like terms are tokenized by word boundaries. Contiguous CJK runs are
    kept and also decomposed into bigrams so related Chinese topics can match
    even when there is no whitespace segmentation.
    """

    counter: Counter[str] = Counter()
    if not text:
        return counter

    for token in re.findall(r"[a-zA-Z0-9][a-zA-Z0-9_-]{1,}", text.lower()):
        token = normalize_keyword(token)
        if token.isdigit():
            continue
        if token and token not in STOPWORDS:
            counter[token] += 1

    for run in re.findall(r"[\u4e00-\u9fff]{2,}", text):
        if len(run) <= 8:
            counter[run] += 1
        for i in range(len(run) - 1):
            counter[run[i : i + 2]] += 1

    return counter


def make_query_text(slug: str, topic: str = "", keywords: Iterable[str] | None = None) -> str:
    parts = [slug.replace("-", " "), topic or ""]
    if keywords:
        parts.append(" ".join(str(k) for k in keywords if str(k).strip()))
    return "\n".join(part for part in parts if part.strip())


def cosine_similarity(a: Counter[str], b: Counter[str]) -> float:
    if not a or not b:
        return 0.0
    shared = set(a) & set(b)
    if not shared:
        return 0.0
    dot = sum(a[t] * b[t] for t in shared)
    norm_a = math.sqrt(sum(v * v for v in a.values()))
    norm_b = math.sqrt(sum(v * v for v in b.values()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def weighted_jaccard(a: Counter[str], b: Counter[str]) -> float:
    if not a or not b:
        return 0.0
    keys = set(a) | set(b)
    numerator = sum(min(a.get(k, 0), b.get(k, 0)) for k in keys)
    denominator = sum(max(a.get(k, 0), b.get(k, 0)) for k in keys)
    return numerator / denominator if denominator else 0.0


def score_keywords(query: Counter[str], candidate: Counter[str]) -> tuple[float, list[str]]:
    shared = [term for term, _ in query.most_common() if term in candidate]
    if not shared:
        return 0.0, []
    score = 0.75 * cosine_similarity(query, candidate) + 0.25 * weighted_jaccard(query, candidate)
    return score, shared[:12]


def iter_jsonl_records(path: Path) -> Iterator[dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8-sig", errors="replace") as handle:
            for line_number, line in enumerate(handle, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError as exc:
                    print(
                        f"warning: skipped malformed JSONL in {path.name}:{line_number}: {exc}",
                        file=sys.stderr,
                    )
                    continue
                if isinstance(record, dict):
                    yield record
    except OSError as exc:
        print(f"warning: could not read {path}: {exc}", file=sys.stderr)


def compact_record_text(record: dict[str, Any], limit: int = 1200) -> str:
    action = record.get("action") if isinstance(record.get("action"), dict) else {}
    params = action.get("parameters", {})
    try:
        params_text = json.dumps(params, ensure_ascii=False, sort_keys=True)
    except TypeError:
        params_text = str(params)
    parts = [
        str(record.get("phase", "")),
        str(record.get("thought", "")),
        str(action.get("tool_name", "")),
        params_text,
        str(record.get("observation", "")),
        str(record.get("reflection", "")),
    ]
    return "\n".join(part for part in parts if part)[:limit]


def recent_trajectory_records(memory_path: Path, n: int = 3) -> list[dict[str, Any]]:
    recent = deque(maxlen=max(n, 0))
    for record in iter_jsonl_records(memory_path):
        recent.append(record)
    return list(recent)


def project_profile_text(project_dir: Path, recent_records: list[dict[str, Any]]) -> str:
    """
    Build a bounded profile for ranking one existing project.

    The first three files carry human-maintained project/topic summaries; recent
    trajectory records carry workflow lessons. All reads are bounded or streamed.
    """

    parts = [
        project_dir.name.replace("-", " "),
        read_text_safe(project_dir / "project.md"),
        read_text_safe(project_dir / "trajectory_summary.md"),
        read_text_safe(project_dir / "SUMMARY.md", limit=20000),
    ]
    parts.extend(compact_record_text(record) for record in recent_records)
    return "\n".join(part for part in parts if part)


def find_reuse_candidates(
    projects_dir: Path,
    new_slug: str,
    query_text: str,
    top_k: int = 3,
    recent_n: int = 3,
    min_score: float = 0.05,
) -> list[ReuseCandidate]:
    """Rank existing project-local trajectory memories by keyword similarity."""

    projects_dir = Path(projects_dir)
    query_keywords = extract_keywords(query_text)
    if not projects_dir.exists() or not query_keywords:
        return []

    candidates: list[ReuseCandidate] = []
    for project_dir in projects_dir.iterdir():
        if not project_dir.is_dir() or project_dir.name == new_slug:
            continue
        memory_path = project_dir / MEMORY_FILENAME
        if not memory_path.exists() or memory_path.stat().st_size == 0:
            continue

        recent_records = recent_trajectory_records(memory_path, n=recent_n)
        profile = project_profile_text(project_dir, recent_records)
        candidate_keywords = extract_keywords(profile)
        score, shared = score_keywords(query_keywords, candidate_keywords)
        if score < min_score or not shared:
            continue

        candidates.append(
            ReuseCandidate(
                slug=project_dir.name,
                score=score,
                shared_keywords=shared,
                memory_path=memory_path,
                recent_records=recent_records,
            )
        )

    candidates.sort(key=lambda item: item.score, reverse=True)
    return candidates[:top_k]


def format_record(record: dict[str, Any]) -> str:
    action = record.get("action") if isinstance(record.get("action"), dict) else {}
    params = action.get("parameters", {})
    try:
        params_text = json.dumps(params, ensure_ascii=False, sort_keys=True)
    except TypeError:
        params_text = str(params)

    lines = [
        f"- [{record.get('timestamp', '')}] {record.get('phase', '')} step={record.get('step', '')}",
        f"  Thought: {record.get('thought', '')}",
        f"  Action: {action.get('tool_name', '')}({params_text})",
        f"  Observation: {record.get('observation', '')}",
    ]
    reflection = record.get("reflection", "")
    if reflection:
        lines.append(f"  Reflection: {reflection}")
    return "\n".join(lines)


def format_reuse_context(
    candidates: list[ReuseCandidate],
    query_text: str,
    max_chars: int = 8000,
) -> tuple[str, bool]:
    if not candidates:
        return (
            "No reusable project-local trajectory memory matched the new project keywords.",
            False,
        )

    blocks = [
        "Retrieved project-local trajectory memories by keyword similarity.",
        "Use these as workflow priors only; do not treat them as literature evidence.",
        "",
        "Query:",
        query_text.strip() or "(empty)",
    ]

    for candidate in candidates:
        blocks.extend(
            [
                "",
                f"## Reuse candidate: {candidate.slug}",
                f"keyword_similarity={candidate.score:.3f}",
                f"shared_keywords={', '.join(candidate.shared_keywords)}",
            ]
        )
        if not candidate.recent_records:
            blocks.append("Trajectory Memory: no recent records available.")
            continue
        blocks.append(f"Trajectory Memory Context (latest {len(candidate.recent_records)} records)")
        blocks.extend(format_record(record) for record in candidate.recent_records)

    context = "\n\n".join(blocks)
    if len(context) > max_chars:
        context = context[:max_chars].rstrip() + "\n... [truncated]"
    return context, True


def build_project_reuse_context(
    projects_dir: Path,
    new_slug: str,
    topic: str = "",
    keywords: Iterable[str] | None = None,
    query_text: str | None = None,
    top_k: int = 3,
    recent_n: int = 3,
    min_score: float = 0.05,
    max_chars: int = 8000,
) -> tuple[str, bool]:
    query = query_text or make_query_text(new_slug, topic=topic, keywords=keywords)
    candidates = find_reuse_candidates(
        projects_dir=projects_dir,
        new_slug=new_slug,
        query_text=query,
        top_k=top_k,
        recent_n=recent_n,
        min_score=min_score,
    )
    return format_reuse_context(candidates, query_text=query, max_chars=max_chars)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Retrieve reusable project-local trajectory memories by keyword similarity."
    )
    parser.add_argument("slug", help="New project slug to exclude from candidate projects.")
    parser.add_argument("--topic", default="", help="New project topic or research question.")
    parser.add_argument("--keywords", nargs="*", default=[], help="Extra project keywords.")
    parser.add_argument("--projects-dir", default=str(DEFAULT_PROJECTS_DIR))
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--recent-n", type=int, default=3)
    parser.add_argument("--min-score", type=float, default=0.05)
    args = parser.parse_args()

    context, _available = build_project_reuse_context(
        projects_dir=Path(args.projects_dir),
        new_slug=args.slug,
        topic=args.topic,
        keywords=args.keywords,
        top_k=args.top_k,
        recent_n=args.recent_n,
        min_score=args.min_score,
    )
    print(context)


if __name__ == "__main__":
    main()
