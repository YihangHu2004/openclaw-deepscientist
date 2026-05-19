# -*- coding: utf-8 -*-
"""
passport.py <slug> <command> [options]

Manages material passport — SHA256 content hashes for artifacts.
Append-only: once signed, entries cannot be removed.

Commands:
  sign    Compute SHA256 of artifact and append to pipeline_state.json
  verify  Compare current hash against passport; report if tampered
  list    List all passport entries for the project
"""
import argparse
import hashlib
import json
import sys
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(__file__).parent.parent
STATE_DIR  = WORKSPACE / "state" / "projects"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_state(proj_dir: Path) -> dict:
    ps_path = proj_dir / "pipeline_state.json"
    if not ps_path.exists():
        print("❌ pipeline_state.json 不存在，请先运行 init_project.py", file=sys.stderr)
        sys.exit(1)
    return json.loads(ps_path.read_text(encoding="utf-8"))


def save_state(proj_dir: Path, data: dict) -> None:
    ps_path = proj_dir / "pipeline_state.json"
    data["last_updated"] = now_iso()
    ps_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Commands ───────────────────────────────────────────────────────────────────

def cmd_sign(proj_dir: Path, args) -> None:
    artifact_path = Path(args.artifact_path)
    if not artifact_path.exists():
        print(f"❌ 文件不存在：{artifact_path}", file=sys.stderr)
        sys.exit(1)

    digest = sha256_file(artifact_path)
    rel_path = str(artifact_path)

    ps = load_state(proj_dir)
    passport = ps.setdefault("material_passport", [])

    entry = {
        "artifact":    rel_path,
        "stage":       args.stage,
        "sha256":      digest,
        "signed_at":   now_iso(),
    }
    passport.append(entry)
    save_state(proj_dir, ps)

    size_kb = artifact_path.stat().st_size / 1024
    print(f"✅ 物料护照已签署 (S{args.stage})")
    print(f"   文件：{artifact_path.name}  ({size_kb:.1f} KB)")
    print(f"   SHA256：{digest[:16]}…{digest[-8:]}")
    print(f"   护照总条数：{len(passport)}")


def cmd_verify(proj_dir: Path, args) -> None:
    artifact_path = Path(args.artifact_path)
    if not artifact_path.exists():
        print(f"❌ 文件不存在：{artifact_path}", file=sys.stderr)
        sys.exit(1)

    ps = load_state(proj_dir)
    passport = ps.get("material_passport", [])
    rel_path = str(artifact_path)

    matches = [e for e in passport if e.get("artifact") == rel_path]
    if not matches:
        print(f"⚠️  未找到护照记录：{artifact_path.name}")
        print("   该文件尚未签署，或签署时使用了不同路径。")
        sys.exit(1)

    latest = matches[-1]
    recorded = latest["sha256"]
    current  = sha256_file(artifact_path)

    if current == recorded:
        print(f"✅ 文件完整性验证通过：{artifact_path.name}")
        print(f"   签署于：{latest['signed_at']}  (S{latest.get('stage', '?')})")
        print(f"   SHA256：{recorded[:16]}…{recorded[-8:]}")
    else:
        print(f"⚠️  产出物已被外部修改：{artifact_path.name}")
        print(f"   签署哈希：{recorded[:16]}…{recorded[-8:]}")
        print(f"   当前哈希：{current[:16]}…{current[-8:]}")
        print(f"   最后签署：{latest['signed_at']}")
        sys.exit(2)


def cmd_list(proj_dir: Path, args) -> None:
    ps = load_state(proj_dir)
    passport = ps.get("material_passport", [])

    if not passport:
        print("\n📋 物料护照为空（尚无签署记录）")
        return

    print(f"\n📋 物料护照记录（共 {len(passport)} 条）\n")
    for entry in passport:
        path = Path(entry.get("artifact", ""))
        digest = entry.get("sha256", "")
        stage  = entry.get("stage", "?")
        ts     = entry.get("signed_at", "")[:19].replace("T", " ")
        print(f"  S{stage}  {path.name}")
        print(f"       SHA256：{digest[:16]}…{digest[-8:]}  签署：{ts}")
        print()


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="物料护照管理（SHA256 内容哈希）")
    parser.add_argument("slug", help="项目 slug")
    sub = parser.add_subparsers(dest="command", required=True)

    # sign
    p_sign = sub.add_parser("sign", help="签署文件 SHA256")
    p_sign.add_argument("artifact_path", help="要签署的文件路径")
    p_sign.add_argument("stage", type=int, help="签署时所处阶段编号")

    # verify
    p_ver = sub.add_parser("verify", help="验证文件完整性")
    p_ver.add_argument("artifact_path", help="要验证的文件路径")

    # list
    sub.add_parser("list", help="列出所有护照记录")

    args     = parser.parse_args()
    proj_dir = STATE_DIR / args.slug

    if not proj_dir.exists():
        print(f"❌ 项目不存在：{args.slug}", file=sys.stderr)
        sys.exit(1)

    {"sign": cmd_sign, "verify": cmd_verify, "list": cmd_list}[args.command](proj_dir, args)


if __name__ == "__main__":
    main()
