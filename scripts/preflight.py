# -*- coding: utf-8 -*-
"""
preflight.py — 每次 AI 回复前的强制检查脚本

输出格式：
  STATUS=HARD_STOP  reason=<原因>   → AI 本轮只能展示检查结果，禁止研究/分析/搜索
  STATUS=PROCEED                    → 正常继续

检查项：
  1. .hard_stop_init 锁文件（init_project.py 中途失败/中断时留下）
  2. pipeline_state.json 损坏的项目目录
  3. 输出活跃项目摘要（AI 快速感知当前状态）

Exit code: 0 always（调用方读 stdout）
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

WORKSPACE = Path(__file__).parent.parent
STATE_DIR = WORKSPACE / "state" / "projects"
HARD_STOP = WORKSPACE / ".hard_stop_init"


def check_hard_stop() -> tuple[bool, str]:
    if not HARD_STOP.exists():
        return False, ""
    try:
        payload = json.loads(HARD_STOP.read_text(encoding="utf-8"))
        slug    = payload.get("slug", "unknown")
        reason  = payload.get("reason", "未知原因")
        ts      = payload.get("timestamp", "")
        return True, f"项目 {slug} 初始化锁未释放（{reason}，{ts}）"
    except Exception:
        return True, ".hard_stop_init 存在但无法解析"


def scan_projects() -> list[dict]:
    results = []
    if not STATE_DIR.exists():
        return results
    for proj_dir in sorted(STATE_DIR.iterdir()):
        if not proj_dir.is_dir() or proj_dir.name.startswith("."):
            continue
        info = {"slug": proj_dir.name, "has_state": False, "stage": None,
                "mode": None, "status": "unknown", "corrupt": False}
        state_file = proj_dir / "pipeline_state.json"
        if state_file.exists():
            try:
                state = json.loads(state_file.read_text(encoding="utf-8"))
                info["has_state"] = True
                info["stage"]     = state.get("current_stage")
                info["mode"]      = state.get("mode")
                info["status"]    = state.get("status", "active")
            except Exception:
                info["has_state"] = True
                info["corrupt"]   = True
        results.append(info)
    return results


def main() -> None:
    # ── Check 1: hard stop lock ───────────────────────────────────────────
    is_stopped, reason = check_hard_stop()
    if is_stopped:
        print(f"STATUS=HARD_STOP  reason={reason}")
        print("ACTION: 展示此结果给用户，询问是否重新运行 init_project.py <slug>")
        sys.exit(0)

    # ── Check 2: project state scan ───────────────────────────────────────
    projects = scan_projects()
    corrupt  = [p for p in projects if p["corrupt"]]
    active   = [p for p in projects if p["has_state"] and not p["corrupt"]
                and p["status"] not in ("done", "complete")]
    done_    = [p for p in projects if p["has_state"] and not p["corrupt"]
                and p["status"] in ("done", "complete")]

    if corrupt:
        slugs = ", ".join(p["slug"] for p in corrupt)
        print(f"STATUS=HARD_STOP  reason=pipeline_state.json 损坏：{slugs}")
        print("ACTION: 检查并修复上述项目的 pipeline_state.json，或删除损坏目录后重新初始化")
        sys.exit(0)

    # ── All clear ─────────────────────────────────────────────────────────
    print("STATUS=PROCEED")
    print(f"TIMESTAMP={datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}")

    if active:
        print(f"ACTIVE_PROJECTS={len(active)}")
        for p in active:
            stage_str = f"S{p['stage']}" if p["stage"] else "未开始"
            print(f"  · {p['slug']}  mode={p['mode'] or '?'}  stage={stage_str}  status={p['status']}")
    else:
        print("ACTIVE_PROJECTS=0")
        print("HINT: 无活跃项目 → 收到研究主题后立即进入 RESEARCH STEP 0（询问 slug → 询问模式 → exec init_project.py）")

    if done_:
        print(f"DONE_PROJECTS={len(done_)}  ({', '.join(p['slug'] for p in done_)})")


if __name__ == "__main__":
    main()
