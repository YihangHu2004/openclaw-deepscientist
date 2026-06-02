# -*- coding: utf-8 -*-
"""
init_project.py <slug> [--mode AUTO|INTERACTIVE]

Creates the complete file structure for a new research project.
All required files (pipeline_state.json, evidence.json, project.md,
TODO.md, SUMMARY.md) are initialized so that gate_check.py and
ev_manager.py can operate immediately.

Exit code: 0 on success, 1 on error.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).parent.parent
STATE_DIR  = WORKSPACE / "state" / "projects"
GLOBAL_STATE = WORKSPACE / "state"
SCRIPTS_DIR = WORKSPACE / "scripts"
REGISTRY_PATH = WORKSPACE / "state" / "projects_registry.json"

try:
    from trajectory_logger import TrajectoryLogger, TrajectoryLoggerError
except Exception:  # pragma: no cover - project init must still work without memory
    TrajectoryLogger = None
    TrajectoryLoggerError = RuntimeError

try:
    from project_reuse import build_project_reuse_context
except Exception:  # pragma: no cover - project init must still work without reuse
    build_project_reuse_context = None


def deploy_hard_stop(slug: str, reason: str = "") -> None:
    """Deploy the hard-stop lock file."""
    lock_path = WORKSPACE / ".hard_stop_init"
    payload = {
        "slug": slug,
        "reason": reason or "初始化进行中",
        "timestamp": now_iso(),
    }
    lock_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def release_hard_stop() -> None:
    """Remove the hard-stop lock file."""
    lock_path = WORKSPACE / ".hard_stop_init"
    if lock_path.exists():
        lock_path.unlink()

STAGE_NAMES = {
    1: "arxiv-search",
    2: "semantic-scholar",
    3: "paper-reader",
    4: "literature-synthesis",
    5: "research-planner",
    6: "report-writer",
    7: "claim-auditor",        # 强制
    8: "paper-reviewer",       # 强制
    9: "science-slides",       # 可选
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_project_registry() -> dict:
    """Load the workspace project registry, falling back to a valid empty shape."""

    default = {
        "current_project": None,
        "current_pipeline": "research",
        "projects": {},
        "pending_alerts": [],
    }
    if not REGISTRY_PATH.exists():
        return default
    try:
        data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    except Exception:
        return default
    if not isinstance(data, dict):
        return default
    data.setdefault("current_project", None)
    data.setdefault("current_pipeline", "research")
    data.setdefault("projects", {})
    data.setdefault("pending_alerts", [])
    if not isinstance(data["projects"], dict):
        data["projects"] = {}
    if not isinstance(data["pending_alerts"], list):
        data["pending_alerts"] = []
    return data


def save_project_registry(registry: dict) -> None:
    """Atomically persist the project registry used by routing and the UI."""

    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = REGISTRY_PATH.with_suffix(REGISTRY_PATH.suffix + ".tmp")
    tmp_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(REGISTRY_PATH)


def register_project(
    slug: str,
    mode: str,
    topic: str = "",
    keywords: list[str] | None = None,
) -> None:
    """Register an initialized project for router/session/UI bookkeeping."""

    registry = load_project_registry()
    now = now_iso()
    projects = registry.setdefault("projects", {})
    previous = projects.get(slug, {}) if isinstance(projects.get(slug), dict) else {}
    created_at = previous.get("created_at") or now
    projects[slug] = {
        **previous,
        "slug": slug,
        "display_name": previous.get("display_name") or slug,
        "pipeline": "research",
        "mode": mode,
        "status": previous.get("status") or "active",
        "path": str((STATE_DIR / slug).relative_to(WORKSPACE)).replace("\\", "/"),
        "topic": topic,
        "keywords": keywords or [],
        "created_at": created_at,
        "updated_at": now,
        "last_active_pipeline": "research",
    }
    registry["current_project"] = slug
    registry["current_pipeline"] = "research"
    save_project_registry(registry)


STOPWORDS = {
    "the", "and", "for", "with", "from", "that", "this", "into", "about",
    "research", "survey", "review", "project", "paper", "papers", "study",
}


def tokenize(text: str) -> set[str]:
    words = re.findall(r"[a-zA-Z0-9][a-zA-Z0-9_-]{2,}", text.lower())
    return {w for w in words if w not in STOPWORDS}


def read_text_safe(path: Path, limit: int = 20000) -> str:
    try:
        return path.read_text(encoding="utf-8")[:limit]
    except Exception:
        return ""


def project_reuse_context(
    slug: str,
    topic: str = "",
    keywords: list[str] | None = None,
    top_k: int = 3,
    recent_n: int = 3,
) -> tuple[str, bool]:
    """Retrieve reusable trajectory context from existing project memories."""

    if build_project_reuse_context is not None:
        try:
            return build_project_reuse_context(
                projects_dir=STATE_DIR,
                new_slug=slug,
                topic=topic,
                keywords=keywords or [],
                top_k=top_k,
                recent_n=recent_n,
            )
        except Exception as exc:
            return f"Project trajectory reuse unavailable: {exc}", False

    if TrajectoryLogger is None or not STATE_DIR.exists():
        return "No reusable project trajectory found.", False

    query_tokens = tokenize(" ".join([slug.replace("-", " "), topic, " ".join(keywords or [])]))
    candidates = []
    for proj in STATE_DIR.iterdir():
        if not proj.is_dir() or proj.name == slug:
            continue
        memory_path = proj / "trajectory_memory.jsonl"
        if not memory_path.exists() or memory_path.stat().st_size == 0:
            continue
        profile = "\n".join([
            proj.name.replace("-", " "),
            read_text_safe(proj / "project.md"),
            read_text_safe(proj / "trajectory_summary.md"),
        ])
        tokens = tokenize(profile)
        if not tokens:
            continue
        overlap = len(query_tokens & tokens)
        union = len(query_tokens | tokens) or 1
        score = overlap / union
        if overlap == 0:
            continue
        candidates.append((score, memory_path.stat().st_mtime, proj))

    if not candidates:
        return "No reusable project trajectory found.", False

    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
    blocks = [
        "Retrieved project-local trajectory memories.",
        "Use these as workflow priors only; do not treat them as evidence.",
    ]
    for score, _mtime, proj in candidates[:top_k]:
        try:
            context = TrajectoryLogger(proj).get_recent_context(n=recent_n)
        except Exception as exc:
            context = f"Trajectory Memory unavailable for {proj.name}: {exc}"
        blocks.extend([
            "",
            f"## Reuse candidate: {proj.name}",
            f"keyword_similarity={score:.3f}",
            context,
        ])
    return "\n".join(blocks), True


def write_trajectory_context(proj_dir: Path, slug: str, context: str) -> Path:
    """Persist reusable global trajectory context inside the new project."""

    out = proj_dir / "trajectory_context.md"
    out.write_text(
        "\n".join([
            "# Trajectory Memory Context",
            "",
            f"Project: {slug}",
            "",
            "This file is generated when the project is initialized.",
            "Use it as prior workflow memory, not as paper evidence.",
            "Literature claims still require EV records in evidence.json.",
            "",
            "```text",
            context,
            "```",
            "",
        ]),
        encoding="utf-8",
    )
    return out


def init_project(
    slug: str,
    mode: str,
    papers: list[str] | None = None,
    topic: str = "",
    keywords: list[str] | None = None,
) -> None:
    proj_dir = STATE_DIR / slug
    papers = papers or []
    keywords = keywords or []

    if proj_dir.exists():
        print(f"⚠️  项目已存在：{proj_dir}")
        print("   如需重新初始化，请先备份并删除该目录。")
        sys.exit(1)

    # Deploy HARD STOP lock BEFORE any file creation
    deploy_hard_stop(slug, "初始化进行中 — 禁止提前产出的内容")
    print("🔒 HARD STOP 已部署: 完成初始化前禁止任何研究产出")

    proj_dir.mkdir(parents=True)
    (proj_dir / "slides").mkdir()

    # ── papers/ directory ─────────────────────────────────────────────────────
    papers_dir = proj_dir / "papers"
    papers_dir.mkdir()
    copied = 0
    for pdf_path_str in papers:
        src = Path(pdf_path_str)
        if src.exists() and src.suffix.lower() == ".pdf":
            shutil.copy2(str(src), str(papers_dir / src.name))
            print(f"   📄 已复制 PDF: {src.name}")
            copied += 1
        else:
            print(f"   ⚠️  跳过（不存在或非 PDF）: {pdf_path_str}")
    if copied:
        print(f"   ✅ 共复制 {copied} 篇 PDF 到 papers/")

    # ── pipeline_state.json ───────────────────────────────────────────────────
    pipeline_state = {
        "schema_version": 1,
        "project": slug,
        "mode": mode,
        "current_stage": 1,
        "stage_status": {str(i): "pending" for i in range(1, 10)},
        "gate_results": {},
        "interactive_checkpoint": None,
        "pending_action": None,
        "improvement_counts": {},
        "consecutive_confirms": 0,
        "material_passport": [],
        "created_at": now_iso(),
        "last_updated": now_iso(),
    }
    write_json(proj_dir / "pipeline_state.json", pipeline_state)

    # ── evidence.json ─────────────────────────────────────────────────────────
    evidence = {
        "schema_version": 1,
        "project": slug,
        "next_ev_id": 1,
        "items": [],
    }
    write_json(proj_dir / "evidence.json", evidence)

    evidence_memory = {
        "schema_version": 1,
        "project": slug,
        "updated_at": now_iso(),
        "source_evidence_count": 0,
        "cards": [],
    }
    write_json(proj_dir / "evidence_memory.json", evidence_memory)

    # ── project.md ────────────────────────────────────────────────────────────
    today = datetime.now().strftime("%Y-%m-%d")
    project_md = f"""# 项目：{slug}

- **状态**: planning
- **模式**: {mode}
- **创建**: {today}
- **领域标签**: []

## 研究主题


## 论文库（已读）

| arXiv ID | 标题 | 年份 | 引用数 | Triage | 相关度 | 核心贡献 |
|----------|------|------|--------|--------|--------|---------|

## 核心发现


## Research Gap（初步）


## 综述草稿（S4 产出）


## 研究计划（S5 产出）

### 研究问题

### 假设

### 数据集

### 基线方法

### 子问题分解

### 实验设计

### 可行性评估

### 时间表

## 下一步

"""
    project_md += (
        "\n## Trajectory Memory Context\n\n"
        "See `trajectory_context.md` for reusable workflow memory from previous projects.\n"
        "Treat it as operational prior context, not as citation evidence.\n"
    )
    if topic or keywords:
        project_md += "\n## Project Intake Metadata\n\n"
        if topic:
            project_md += f"Topic: {topic}\n"
        if keywords:
            project_md += f"Keywords: {', '.join(keywords)}\n"
    (proj_dir / "project.md").write_text(project_md, encoding="utf-8")
    trajectory_context, trajectory_available = project_reuse_context(
        slug,
        topic=topic,
        keywords=keywords,
    )
    trajectory_context_path = write_trajectory_context(proj_dir, slug, trajectory_context)
    if TrajectoryLogger is not None:
        try:
            logger = TrajectoryLogger(proj_dir)
            logger.log_memory_retrieval(
                requester_phase="Project_Init",
                files_read=[
                    "state/projects/*/project.md",
                    "state/projects/*/SUMMARY.md",
                    "state/projects/*/trajectory_summary.md",
                    "state/projects/*/trajectory_memory.jsonl",
                ],
                records_returned=trajectory_context.count("- ["),
                query={
                    "slug": slug,
                    "topic": topic,
                    "keywords": keywords,
                    "top_k": 3,
                    "recent_n": 3,
                },
                observation=(
                    f"Retrieved reusable project trajectory context; "
                    f"available={trajectory_available}; wrote {trajectory_context_path.relative_to(WORKSPACE)}."
                ),
                reflection="Project initialization now exposes old-memory retrieval as a visible trajectory step.",
            )
        except Exception as exc:
            print(f"鈿狅笍  Project trajectory memory init skipped: {exc}", file=sys.stderr)

    # ── TODO.md ───────────────────────────────────────────────────────────────
    todo_md = f"""# {slug} 研究进度

- [ ] 阶段 1+2：文献搜索（arxiv-search + semantic-scholar）
- [ ] 阶段 3：论文精读（paper-reader）
- [ ] 阶段 4：文献综述（literature-synthesis）
- [ ] 阶段 5：研究规划（research-planner）
- [ ] 阶段 6：科研报告（report-writer）
- [ ] 阶段 7：引用审计（claim-auditor，强制）
- [ ] 阶段 8：同行评审（paper-reviewer，强制）
- [ ] 阶段 9：开题 PPT（science-slides，可选）
"""
    (proj_dir / "TODO.md").write_text(todo_md, encoding="utf-8")

    # ── SUMMARY.md ────────────────────────────────────────────────────────────
    (proj_dir / "SUMMARY.md").write_text(f"# {slug} 阶段摘要\n\n", encoding="utf-8")

    # ── Global baselines.json (once per workspace) ────────────────────────────
    baselines_path = GLOBAL_STATE / "baselines.json"
    if not baselines_path.exists():
        write_json(baselines_path, {
            "schema_version": 1,
            "datasets": [],
            "baselines": [],
        })
        print("✅ 已初始化 state/baselines.json")

    try:
        register_project(slug, mode, topic=topic, keywords=keywords)
    except Exception as exc:
        print(f"⚠️  Project registry sync skipped: {exc}", file=sys.stderr)

    # Release HARD STOP lock after successful init
    release_hard_stop()

    if TrajectoryLogger is not None:
        try:
            logger = TrajectoryLogger(proj_dir)
            init_record = logger.log_step(
                phase="Project_Init",
                step=logger.get_next_step("Project_Init"),
                thought="Initialize a new project and attach reusable trajectory context from prior work.",
                action_name="init_project",
                action_params={
                    "slug": slug,
                    "mode": mode,
                    "papers": papers,
                    "topic": topic,
                    "keywords": keywords,
                    "trajectory_context": str(trajectory_context_path.relative_to(WORKSPACE)),
                },
                observation=f"Created project {slug}; trajectory context available={trajectory_available}.",
                reflection="New project can reuse trajectory_context.md as workflow memory while keeping evidence claims gated by evidence.json.",
            )
            logger.log_memory_store(init_record, requester_phase="Project_Init")
        except Exception as exc:
            print(f"⚠️  Trajectory memory log skipped: {exc}", file=sys.stderr)

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n✅ 项目 [{slug}] 初始化完成")
    print(f"🔓 HARD STOP 已解除: 可以开始研究")
    print(f"   模式：{mode}")
    print(f"   目录：{proj_dir}\n")
    print("📁 已创建文件：")
    print(f"   Trajectory context: {trajectory_context_path.relative_to(proj_dir)}")
    for f in sorted(proj_dir.rglob("*")):
        if f.is_file():
            print(f"   · {f.relative_to(proj_dir)}")
    print(f"\n→ 下一步：在 project.md 填写研究主题，然后运行阶段 1（arxiv-search）")
    print(f"→ 门控验证：python scripts/gate_check.py {slug} 1")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="初始化科研项目目录结构（创建 pipeline_state.json、evidence.json 等）"
    )
    parser.add_argument("slug", help="项目 slug（目录名，英文小写连字符）")
    parser.add_argument(
        "--mode",
        choices=["AUTO", "INTERACTIVE"],
        default="INTERACTIVE",
        help="流水线运行模式（默认 INTERACTIVE）",
    )
    parser.add_argument(
        "--papers",
        nargs="*",
        default=[],
        help="PDF 路径列表，复制到 papers/ 目录",
    )
    parser.add_argument(
        "--topic",
        default="",
        help="Research topic or question used to retrieve similar project trajectory memories.",
    )
    parser.add_argument(
        "--keywords",
        nargs="*",
        default=[],
        help="Extra keywords used for project trajectory memory reuse.",
    )
    args = parser.parse_args()
    init_project(args.slug, args.mode, args.papers, topic=args.topic, keywords=args.keywords)


if __name__ == "__main__":
    main()
