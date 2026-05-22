# -*- coding: utf-8 -*-
"""
workspace_doctor.py

Scans the workspace for structural violations and reports them.
Called automatically by session_restore.py at startup.

Exit code: 0 = clean, 1 = violations found
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

WORKSPACE = Path(__file__).parent.parent
STATE_PROJECTS = WORKSPACE / "state" / "projects"
PROJECTS_DIR   = WORKSPACE / "projects"          # wrong location
REQUIRED_FILES = ["pipeline_state.json", "evidence.json", "TODO.md"]

# Patterns that indicate stray temp scripts left in workspace root
STRAY_TEMP_PATTERNS = ["_*.py", "*.tmp", "*.bak"]


def check() -> list[str]:
    violations: list[str] = []

    # 1. Stray files in projects/ (wrong directory)
    if PROJECTS_DIR.exists():
        stray = [d for d in PROJECTS_DIR.iterdir() if d.is_dir()]
        for d in stray:
            violations.append(
                f"❌ 项目位置错误：{d.name} 在 projects/ 而非 state/projects/"
            )

    # 2. Projects in state/projects/ missing required files
    if STATE_PROJECTS.exists():
        for proj_dir in STATE_PROJECTS.iterdir():
            if not proj_dir.is_dir() or proj_dir.name.startswith("."):
                continue
            missing = [f for f in REQUIRED_FILES if not (proj_dir / f).exists()]
            if missing:
                violations.append(
                    f"⚠️  {proj_dir.name}: 缺少 {', '.join(missing)}（未完整初始化）"
                )

    # 3. Projects registry consistency
    registry_path = WORKSPACE / "state" / "projects_registry.json"
    if registry_path.exists():
        try:
            registry = json.loads(registry_path.read_text(encoding="utf-8"))
            registered = set(registry.get("projects", {}).keys())
            on_disk = {
                d.name for d in STATE_PROJECTS.iterdir()
                if d.is_dir() and not d.name.startswith(".")
            } if STATE_PROJECTS.exists() else set()

            for slug in on_disk - registered:
                violations.append(f"⚠️  {slug}: 目录存在但未在 projects_registry.json 中注册")
        except Exception:
            violations.append("⚠️  projects_registry.json 解析失败")

    # 4. Stray temp scripts in workspace root (forbidden by policy)
    stray_temps: list[str] = []
    for pattern in STRAY_TEMP_PATTERNS:
        stray_temps.extend(f.name for f in WORKSPACE.glob(pattern) if f.is_file())
    if stray_temps:
        violations.append(
            f"❌ 根目录发现遗留临时文件（{len(stray_temps)} 个）："
            f" {', '.join(stray_temps[:5])}{'...' if len(stray_temps) > 5 else ''}"
        )

    return violations


def main() -> None:
    violations = check()
    if not violations:
        print("✅ workspace_doctor: 工作区结构正常")
        sys.exit(0)
    else:
        print("╔══ workspace_doctor 发现结构问题 ════════════════════════╗")
        for v in violations:
            print(f"║  {v}")
        print("╠══ 修复建议 ══════════════════════════════════════════════╣")
        print("║  · 错误目录中的项目 → 移至 state/projects/<slug>/")
        print("║  · 缺失文件 → 运行 python scripts/init_project.py <slug> --repair")
        print("║  · 未注册项目 → 会话开始时询问用户是否补录")
        print("║  · 根目录临时文件 → 移至 state/projects/<slug>/tmp/ 并在执行后删除")
        print("╚═════════════════════════════════════════════════════════╝")
        sys.exit(1)


if __name__ == "__main__":
    main()
