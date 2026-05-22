# -*- coding: utf-8 -*-
"""
intent_router.py  [message]

Routes a user message to the correct pipeline and project.

Usage:
    python scripts/intent_router.py "用户消息内容"
    echo "用户消息内容" | python scripts/intent_router.py

Output (stdout): JSON route result
    {
        "pipeline": "research" | "writing" | "alert" | "outreach",
        "project_slug": "<slug> | null",
        "action": "continue" | "new" | "switch"
    }

Side effect: writes current_pipeline back to state/projects_registry.json
Exit code: 0 always (caller reads stdout JSON)
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

WORKSPACE = Path(__file__).parent.parent
REGISTRY_PATH = WORKSPACE / "state" / "projects_registry.json"

# ── Priority: outreach > writing > alert > research (on tie) ──────────────
PIPELINE_KEYWORDS: dict[str, list[str]] = {
    "outreach": ["套磁", "导师", "教授", "申请", "邮件", "contact", "professor", "faculty"],
    "writing":  ["写论文", "写作", "草稿", "draft", "修改", "润色", "章节", "论文写", "paper writing"],
    "alert":    ["追踪", "订阅", "新论文", "alert", "推送", "更新", "follow", "monitor"],
    "research": ["研究", "文献", "综述", "开题", "调研", "survey", "literature", "review"],
}

PIPELINE_PRIORITY = ["outreach", "writing", "alert", "research"]

SWITCH_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r"切换到(.+?)项目",
        r"换(?:到|成|用)(.+?)项目",
        r"switch\s+to\s+(\S+)",
        r"换项目[：:]?\s*(\S+)",
    ]
]

HEARTBEAT_MARKERS = ["heartbeat", "HEARTBEAT", "心跳", "__heartbeat__"]


def load_registry() -> dict:
    if not REGISTRY_PATH.exists():
        return {"current_project": None, "current_pipeline": None,
                "projects": {}, "pending_alerts": []}
    try:
        return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"current_project": None, "current_pipeline": None,
                "projects": {}, "pending_alerts": []}


def save_registry(reg: dict) -> None:
    REGISTRY_PATH.write_text(json.dumps(reg, ensure_ascii=False, indent=2),
                              encoding="utf-8")


def detect_switch(message: str) -> str | None:
    """Return slug from explicit switch command, or None."""
    for pat in SWITCH_PATTERNS:
        m = pat.search(message)
        if m:
            return m.group(1).strip()
    return None


def detect_pipeline(message: str) -> str | None:
    """Return highest-priority pipeline whose keywords appear in message, or None."""
    for pipeline in PIPELINE_PRIORITY:
        for kw in PIPELINE_KEYWORDS[pipeline]:
            if kw.lower() in message.lower():
                return pipeline
    return None


def resolve_project(slug_hint: str | None, reg: dict) -> tuple[str | None, bool]:
    """
    Best-effort project resolution from slug hint or current context.
    Returns (slug, is_known) — is_known=False means the slug came from the
    message but isn't in the registry yet (caller should treat as 'new').
    """
    if slug_hint:
        # Exact match first
        if slug_hint in reg["projects"]:
            return slug_hint, True
        # Partial match
        hint_lower = slug_hint.lower()
        for slug, info in reg["projects"].items():
            if hint_lower in slug.lower():
                return slug, True
            if hint_lower in info.get("display_name", "").lower():
                return slug, True
        # Not in registry — return the raw hint so caller can create it
        return slug_hint, False
    # Fall back to current project
    current = reg.get("current_project")
    return current, current is not None


def route(message: str) -> dict:
    reg = load_registry()

    # ── Heartbeat handling ──────────────────────────────────────────────
    is_heartbeat = any(m in message for m in HEARTBEAT_MARKERS)
    if is_heartbeat:
        current_pipeline = reg.get("current_pipeline") or "research"
        current_project = reg.get("current_project")
        if reg.get("current_pipeline") and current_project:
            # Active conversation: queue alert, don't interrupt
            reg.setdefault("pending_alerts", []).append(message)
            save_registry(reg)
            result = {
                "pipeline": current_pipeline,
                "project_slug": current_project,
                "action": "queued_alert",
                "load_context": {
                    "identity": "SCIENTIST.md",
                    "pipeline_config": f"pipelines/{current_pipeline}.md",
                    "shared": ["MEMORY.md", "USER_CONFIG.md"],
                    "project": f"state/projects/{current_project}/pipeline_state.json",
                },
            }
        else:
            result = {
                "pipeline": "alert",
                "project_slug": current_project,
                "action": "continue",
                "load_context": {
                    "identity": "SCIENTIST.md",
                    "pipeline_config": "pipelines/alert.md",
                    "shared": ["MEMORY.md", "USER_CONFIG.md"],
                    "project": None,
                },
            }
        return result

    action = "continue"
    slug_hint = None
    pipeline = None

    # ── Priority 1: explicit switch command ─────────────────────────────
    switch_target = detect_switch(message)
    if switch_target:
        slug_hint = switch_target
        action = "switch"
        # After switching, infer pipeline from the rest of the message or context
        pipeline = detect_pipeline(message) or reg.get("current_pipeline") or "research"

    # ── Priority 2: explicit pipeline keyword ───────────────────────────
    if pipeline is None:
        pipeline = detect_pipeline(message)
        if pipeline:
            action = "continue" if reg.get("current_pipeline") == pipeline else "switch"

    # ── Priority 3: current context ─────────────────────────────────────
    if pipeline is None:
        pipeline = reg.get("current_pipeline") or "research"
        action = "continue"

    # ── Resolve project ─────────────────────────────────────────────────
    project_slug, is_known = resolve_project(slug_hint, reg)

    # Determine action:
    # - explicit switch command → "switch"
    # - slug came from message but not in registry → "new"
    # - no project at all (bare "继续" with empty registry) → "continue" (caller handles)
    # - known project, pipeline different from current → "switch"
    if action == "switch" and not is_known and project_slug:
        action = "new"
    elif project_slug is None:
        # No project context at all — still "continue" (caller creates context)
        action = "continue"

    # ── Write back ──────────────────────────────────────────────────────
    prev_pipeline = reg.get("current_pipeline")
    reg["current_pipeline"] = pipeline
    if project_slug and is_known:
        reg["current_project"] = project_slug
        if project_slug in reg["projects"]:
            reg["projects"][project_slug]["last_active_pipeline"] = pipeline
    save_registry(reg)

    # Refine: if pipeline silently changed (keyword match, no explicit switch) → switch
    if action == "continue" and prev_pipeline and prev_pipeline != pipeline:
        action = "switch"

    pipeline_config = f"pipelines/{pipeline}.md"

    # Resolve per-pipeline project state path
    if pipeline == "outreach":
        project_state = (
            f"state/outreach/{project_slug}/outreach_state.json"
            if project_slug else None
        )
    else:
        project_state = (
            f"state/projects/{project_slug}/pipeline_state.json"
            if project_slug else None
        )

    load_context: dict = {
        "identity": "SCIENTIST.md",
        "pipeline_config": pipeline_config,
        "shared": ["MEMORY.md", "USER_CONFIG.md"],
        "project": project_state,
    }
    if pipeline == "research":
        load_context["baselines"] = "state/baselines.json"
    if pipeline == "outreach":
        load_context["user_profile"] = "USER_PROFILE.md"

    return {
        "pipeline": pipeline,
        "project_slug": project_slug,
        "action": action,
        "load_context": load_context,
    }


def main() -> None:
    if len(sys.argv) >= 2:
        message = " ".join(sys.argv[1:])
    else:
        message = sys.stdin.read().strip()

    if not message:
        print(json.dumps({"error": "empty message"}, ensure_ascii=False))
        sys.exit(0)

    result = route(message)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
