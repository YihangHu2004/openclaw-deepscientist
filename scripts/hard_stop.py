#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
hard_stop.py — 部署/解除硬阻断锁
=================================
部署：python scripts/hard_stop.py lock <slug> "<reason>"
解除：python scripts/hard_stop.py unlock

部署后，在锁释放前：
- preflight.py 返回 HARD_STOP
- 任何依赖协议前置条件的脚本拒绝运行
"""
import json, os, sys, time
sys.stdout.reconfigure(encoding="utf-8")

WORKSPACE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCK_FILE = os.path.join(WORKSPACE, ".hard_stop_init")

def lock(slug, reason):
    payload = {
        "slug": slug,
        "reason": reason,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "message": (
            f"🔴 HARD STOP: 项目 {slug} 必须完成 RESEARCH STEP 0 才能继续。\n"
            f"   原因: {reason}\n"
            f"   解决: 运行 python scripts/hard_release.py 解除锁后按协议走 STEP 0"
        )
    }
    with open(LOCK_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"🔒 HARD STOP deployed: {slug}")
    print(f"   文件: {LOCK_FILE}")

def unlock():
    if os.path.exists(LOCK_FILE):
        os.remove(LOCK_FILE)
        print("🔓 HARD STOP released")
    else:
        print("ℹ️  No lock file found")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python hard_stop.py lock|unlock [slug] [reason]")
        sys.exit(1)
    
    action = sys.argv[1]
    if action == "lock":
        slug = sys.argv[2] if len(sys.argv) > 2 else "unknown"
        reason = sys.argv[3] if len(sys.argv) > 3 else "未完成初始化"
        lock(slug, reason)
    elif action == "unlock":
        unlock()
    else:
        print(f"Unknown action: {action}")
        sys.exit(1)
