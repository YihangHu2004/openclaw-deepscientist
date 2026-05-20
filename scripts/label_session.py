# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""
Label the current active scientist session in sessions.json.

Usage:
    python scripts/label_session.py <slug>

Examples:
    python scripts/label_session.py rag-hallucination
    → labels session as "rag-hallucination-001" (auto-increments)

The label shows in the OpenClaw UI sidebar instead of "dashboard:uuid".
"""
import json
import os
import sys

SESSIONS_FILE = os.path.expanduser(
    "~/.openclaw/agents/scientist/sessions/sessions.json"
)


def get_seq_number(slug: str, sessions: dict) -> str:
    """Count existing sessions with same slug prefix to get next sequence number."""
    count = sum(
        1 for v in sessions.values()
        if v.get("label", "").startswith(slug + "-")
    )
    return str(count + 1).zfill(3)


def find_active_session(sessions: dict) -> str | None:
    """Find the current active dashboard session (no endedAt, most recently started)."""
    # Prefer sessions without endedAt (still running)
    active = [
        (k, v.get("sessionStartedAt", 0))
        for k, v in sessions.items()
        if "dashboard" in k and "endedAt" not in v
    ]
    if not active:
        # Fallback: most recently started dashboard session
        active = [
            (k, v.get("sessionStartedAt", 0))
            for k, v in sessions.items()
            if "dashboard" in k
        ]
    if not active:
        return None
    active.sort(key=lambda x: x[1], reverse=True)
    return active[0][0]


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/label_session.py <slug>", file=sys.stderr)
        sys.exit(1)

    slug = sys.argv[1].strip()
    if not slug:
        print("Error: slug cannot be empty", file=sys.stderr)
        sys.exit(1)

    if not os.path.isfile(SESSIONS_FILE):
        print(f"Error: sessions file not found: {SESSIONS_FILE}", file=sys.stderr)
        sys.exit(1)

    with open(SESSIONS_FILE, encoding="utf-8") as f:
        sessions = json.load(f)

    session_key = find_active_session(sessions)
    if not session_key:
        print("Warning: no active dashboard session found, skipping label", file=sys.stderr)
        sys.exit(0)

    # Check if already labeled
    existing_label = sessions[session_key].get("label", "")
    if existing_label and existing_label.startswith(slug):
        print(f"[skip] already labeled: {existing_label}")
        sys.exit(0)

    seq = get_seq_number(slug, sessions)
    label = f"{slug}-{seq}"
    sessions[session_key]["label"] = label

    with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(sessions, f, ensure_ascii=False, indent=2)

    print(f"[OK] session labeled: {label}")
    print(f"     key: {session_key}")


if __name__ == "__main__":
    main()
