#!/usr/bin/env bash
set -e

OPENCLAW_DIR="${HOME}/.openclaw"
WORKSPACE_DEST="${OPENCLAW_DIR}/workspace-scientist"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔬 OpenClaw Scientist 安装中..."

# ─── --update 模式：只更新框架，不碰个人数据 ─────────────────
if [ "$1" = "--update" ]; then
  echo "📦 更新模式：仅覆盖框架文件，保留个人数据..."
  cp -f "${SCRIPT_DIR}/SCIENTIST.md"     "${WORKSPACE_DEST}/SCIENTIST.md"
  cp -rf "${SCRIPT_DIR}/skills/."        "${WORKSPACE_DEST}/skills/"
  cp -f "${SCRIPT_DIR}/SOUL.md"          "${WORKSPACE_DEST}/SOUL.md"   2>/dev/null || true
  cp -f "${SCRIPT_DIR}/AGENTS.md"        "${WORKSPACE_DEST}/AGENTS.md" 2>/dev/null || true
  cp -f "${SCRIPT_DIR}/TOOLS.md"         "${WORKSPACE_DEST}/TOOLS.md"  2>/dev/null || true
  cp -f "${SCRIPT_DIR}/openclaw.plugin.json" "${WORKSPACE_DEST}/openclaw.plugin.json"
  echo ""
  echo "✅ 框架已更新（个人数据保留）："
  echo "   SCIENTIST.md + skills/ 已更新"
  echo "   USER_CONFIG.md / MEMORY.md / state/ / memory/ 未改动"
  exit 0
fi

# ─── 全新安装 ────────────────────────────────────────────────

# 1. 创建工作区目录
mkdir -p "${WORKSPACE_DEST}/skills"
mkdir -p "${WORKSPACE_DEST}/state/projects"
mkdir -p "${WORKSPACE_DEST}/memory"

# 2. 复制框架文件（-n: 不覆盖已有文件）
cp -rn "${SCRIPT_DIR}/." "${WORKSPACE_DEST}/" 2>/dev/null || \
  rsync -a --ignore-existing "${SCRIPT_DIR}/" "${WORKSPACE_DEST}/" 2>/dev/null || true

# 3. 初始化个人配置（仅首次）
if [ ! -f "${WORKSPACE_DEST}/USER_CONFIG.md" ]; then
  cp "${WORKSPACE_DEST}/USER_CONFIG.example.md" "${WORKSPACE_DEST}/USER_CONFIG.md"
  echo ""
  echo "⚠️  请填写个人配置（首次必须）："
  echo "   open ${WORKSPACE_DEST}/USER_CONFIG.md"
  echo "   至少填写：称呼 + 邮箱（用于 Unpaywall 全文 API）"
fi

# 4. 初始化空 MEMORY.md（仅首次）
if [ ! -f "${WORKSPACE_DEST}/MEMORY.md" ]; then
  cp "${WORKSPACE_DEST}/MEMORY.template.md" "${WORKSPACE_DEST}/MEMORY.md"
fi

# 5. 创建目录占位文件
touch "${WORKSPACE_DEST}/state/projects/.gitkeep" 2>/dev/null || true
touch "${WORKSPACE_DEST}/memory/.gitkeep"          2>/dev/null || true

# 6. 注册 scientist agent 到 openclaw.json
OPENCLAW_CONFIG="${OPENCLAW_DIR}/openclaw.json"
if [ -f "${OPENCLAW_CONFIG}" ]; then
  python3 - "${OPENCLAW_DIR}" "${WORKSPACE_DEST}" <<'PYEOF'
import json, sys, os
openclaw_dir  = sys.argv[1]
workspace     = sys.argv[2]
config_path   = os.path.join(openclaw_dir, "openclaw.json")
with open(config_path) as f:
    cfg = json.load(f)
agents = cfg.setdefault("agents", {}).setdefault("list", [])
if not any(a.get("id") == "scientist" for a in agents):
    agents.append({
        "id": "scientist",
        "model": "deepseek/deepseek-v4-pro",
        "workspace": workspace
    })
    with open(config_path, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    print("✅ scientist agent 已注册到 openclaw.json")
else:
    print("ℹ️  scientist agent 已存在，跳过注册")
PYEOF
else
  echo "⚠️  未找到 ${OPENCLAW_CONFIG}，跳过自动注册"
  echo "   请手动在 openclaw.json 的 agents.list 中添加："
  echo "   { \"id\": \"scientist\", \"model\": \"deepseek/deepseek-v4-pro\", \"workspace\": \"${WORKSPACE_DEST}\" }"
fi

# 7. 安装 Python 依赖（可选）
if command -v pip3 &>/dev/null; then
  echo ""
  echo "📦 安装 Python 依赖..."
  pip3 install --quiet trafilatura python-pptx markdown
  echo "✅ Python 依赖已安装"
else
  echo "⚠️  未找到 pip3，请手动安装："
  echo "   pip install trafilatura python-pptx markdown"
fi

echo ""
echo "✅ 安装完成！"
echo ""
echo "下一步："
echo "  1. 填写个人配置：${WORKSPACE_DEST}/USER_CONFIG.md"
echo "  2. 重启 OpenClaw"
echo "  3. 输入 @scientist 开始使用"
