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
import sys
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).parent.parent
STATE_DIR  = WORKSPACE / "state" / "projects"
GLOBAL_STATE = WORKSPACE / "state"

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


def init_project(slug: str, mode: str) -> None:
    proj_dir = STATE_DIR / slug

    if proj_dir.exists():
        print(f"⚠️  项目已存在：{proj_dir}")
        print("   如需重新初始化，请先备份并删除该目录。")
        sys.exit(1)

    proj_dir.mkdir(parents=True)
    (proj_dir / "slides").mkdir()

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
    (proj_dir / "project.md").write_text(project_md, encoding="utf-8")

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

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n✅ 项目 [{slug}] 初始化完成")
    print(f"   模式：{mode}")
    print(f"   目录：{proj_dir}\n")
    print("📁 已创建文件：")
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
    args = parser.parse_args()
    init_project(args.slug, args.mode)


if __name__ == "__main__":
    main()
