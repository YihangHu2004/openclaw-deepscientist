#!/usr/bin/env bash
set -e

OPENCLAW_DIR="${HOME}/.openclaw"
WORKSPACE_DEST="${OPENCLAW_DIR}/workspace-scientist"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔬 OpenClaw Scientist 安装中..."

# ─── --update 模式：只更新框架，不碰个人数据 ─────────────────
if [ "$1" = "--update" ]; then
  echo "📦 更新模式：仅覆盖框架文件，保留个人数据..."
  # 身份协议文件
  cp -f "${SCRIPT_DIR}/SCIENTIST.md"         "${WORKSPACE_DEST}/SCIENTIST.md"
  cp -f "${SCRIPT_DIR}/AGENTS.md"            "${WORKSPACE_DEST}/AGENTS.md"   2>/dev/null || true
  cp -f "${SCRIPT_DIR}/SOUL.md"              "${WORKSPACE_DEST}/SOUL.md"     2>/dev/null || true
  cp -f "${SCRIPT_DIR}/TOOLS.md"             "${WORKSPACE_DEST}/TOOLS.md"    2>/dev/null || true
  cp -f "${SCRIPT_DIR}/USER.md"              "${WORKSPACE_DEST}/USER.md"     2>/dev/null || true
  cp -f "${SCRIPT_DIR}/IDENTITY.md"          "${WORKSPACE_DEST}/IDENTITY.md" 2>/dev/null || true
  cp -f "${SCRIPT_DIR}/HEARTBEAT.md"         "${WORKSPACE_DEST}/HEARTBEAT.md" 2>/dev/null || true
  # 示例配置（不覆盖用户实际配置）
  cp -f "${SCRIPT_DIR}/USER_CONFIG.example.md"  "${WORKSPACE_DEST}/USER_CONFIG.example.md"
  cp -f "${SCRIPT_DIR}/USER_PROFILE.example.md" "${WORKSPACE_DEST}/USER_PROFILE.example.md" 2>/dev/null || true
  # skills / pipelines / scripts / extensions / deepclaw-ui（全量覆盖框架部分）
  cp -rf "${SCRIPT_DIR}/skills/."            "${WORKSPACE_DEST}/skills/"
  cp -rf "${SCRIPT_DIR}/pipelines/."         "${WORKSPACE_DEST}/pipelines/" 2>/dev/null || true
  cp -rf "${SCRIPT_DIR}/scripts/."           "${WORKSPACE_DEST}/scripts/"
  cp -rf "${SCRIPT_DIR}/extensions/."        "${WORKSPACE_DEST}/extensions/"
  cp -f  "${SCRIPT_DIR}/openclaw.plugin.json" "${WORKSPACE_DEST}/openclaw.plugin.json"
  # deepclaw-ui 源码（不覆盖 node_modules）
  if [ -d "${SCRIPT_DIR}/deepclaw-ui" ]; then
    rsync -a --exclude='node_modules' --exclude='.next' --exclude='out' \
      "${SCRIPT_DIR}/deepclaw-ui/" "${WORKSPACE_DEST}/deepclaw-ui/"
  fi
  echo ""
  echo "✅ 框架已更新（个人数据保留）："
  echo "   SCIENTIST.md + skills/ + pipelines/ + scripts/ + extensions/ + deepclaw-ui/ 已更新"
  echo "   USER_CONFIG.md / USER_PROFILE.md / MEMORY.md / state/ / memory/ 未改动"
  exit 0
fi

# ─── 全新安装 ────────────────────────────────────────────────

# 1. 创建工作区目录
mkdir -p "${WORKSPACE_DEST}/skills"
mkdir -p "${WORKSPACE_DEST}/pipelines"
mkdir -p "${WORKSPACE_DEST}/state/projects"
mkdir -p "${WORKSPACE_DEST}/state/outreach"
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
  cat > "${WORKSPACE_DEST}/MEMORY.md" <<'MEMEOF'
# MEMORY.md - 长期科研记忆

_仅在主会话（与 DeepClaw 直接对话）中读取和更新。_

## 用户研究偏好

- 核心研究领域：（填入）
- 所在机构：（填入）
- 偏好：（填入）

## 常用研究关键词

_（由 DeepClaw 在搜索后自动积累）_

## 常用 arXiv 类别

_（由 DeepClaw 根据研究方向推荐后更新）_

## 活跃项目

_（由 DeepClaw 自动记录）_
MEMEOF
fi

# 4b. 初始化用户学术画像（仅首次）
if [ ! -f "${WORKSPACE_DEST}/USER_PROFILE.md" ] && [ -f "${WORKSPACE_DEST}/USER_PROFILE.example.md" ]; then
  cp "${WORKSPACE_DEST}/USER_PROFILE.example.md" "${WORKSPACE_DEST}/USER_PROFILE.md"
  echo ""
  echo "⚠️  请填写学术画像（套磁功能必须）："
  echo "   open ${WORKSPACE_DEST}/USER_PROFILE.md"
fi

# 5. 创建目录占位文件
touch "${WORKSPACE_DEST}/state/projects/.gitkeep" 2>/dev/null || true
touch "${WORKSPACE_DEST}/state/outreach/.gitkeep" 2>/dev/null || true
touch "${WORKSPACE_DEST}/memory/.gitkeep"          2>/dev/null || true

# 6. 注册 scientist agent 和 workspace-api 扩展到 openclaw.json
OPENCLAW_CONFIG="${OPENCLAW_DIR}/openclaw.json"
if [ -f "${OPENCLAW_CONFIG}" ]; then
  python - "${OPENCLAW_DIR}" "${WORKSPACE_DEST}" "${SCRIPT_DIR}/extensions/workspace-api" <<'PYEOF'
import json, sys, os
openclaw_dir  = sys.argv[1]
workspace     = sys.argv[2]
ext_source    = sys.argv[3]   # workspace-api 扩展的绝对路径
config_path   = os.path.join(openclaw_dir, "openclaw.json")

with open(config_path) as f:
    cfg = json.load(f)

# --- 注册 scientist agent ---
agents = cfg.setdefault("agents", {}).setdefault("list", [])
if not any(a.get("id") == "scientist" for a in agents):
    agents.append({
        "id": "scientist",
        "model": "deepseek/deepseek-v4-pro",
        "workspace": workspace
    })
    print("✅ scientist agent 已注册到 openclaw.json")
else:
    print("ℹ️  scientist agent 已存在，跳过注册")

# --- 注册 workspace-api 扩展 ---
plugins = cfg.setdefault("plugins", {}).setdefault("entries", {})
if "workspace-api" not in plugins:
    plugins["workspace-api"] = {
        "enabled": True,
        "source": ext_source
    }
    print(f"✅ workspace-api 扩展已注册 (source: {ext_source})")
else:
    print("ℹ️  workspace-api 扩展已存在，跳过注册")

with open(config_path, "w") as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
PYEOF
else
  echo "⚠️  未找到 ${OPENCLAW_CONFIG}，跳过自动注册"
  echo "   请手动在 openclaw.json 的 agents.list 中添加 scientist agent"
  echo "   并在 plugins.entries 中添加 workspace-api 扩展"
fi

# 7. 安装 Python 依赖（可选）
if command -v pip &>/dev/null; then
  echo ""
  echo "📦 安装 Python 依赖..."
  pip install --quiet trafilatura python-pptx markdown numpy scipy sympy pdfplumber pypdf
  echo "✅ Python 依赖已安装"
else
  echo "⚠️  未找到 pip，请手动安装："
  echo "   pip install trafilatura python-pptx markdown numpy scipy sympy pdfplumber pypdf"
fi

# 8. 安装 Workspace UI Node.js 依赖
EXT_DIR="${WORKSPACE_DEST}/extensions/workspace-api"
if [ -d "${EXT_DIR}" ] && command -v npm &>/dev/null; then
  echo ""
  echo "📦 安装 Workspace UI 依赖..."
  npm install --prefix "${EXT_DIR}" --silent
  echo "✅ Workspace UI 依赖已安装"
else
  echo "⚠️  未找到 npm 或扩展目录，请手动安装："
  echo "   cd ${EXT_DIR} && npm install"
fi

# 9. 安装 DeepClaw UI（对话界面）
DCUI_SERVER="${WORKSPACE_DEST}/deepclaw-ui/server"
DCUI_CLIENT="${WORKSPACE_DEST}/deepclaw-ui/client"
if command -v npm &>/dev/null; then
  if [ -d "${DCUI_SERVER}" ]; then
    echo ""
    echo "📦 安装 DeepClaw UI 服务端依赖..."
    npm install --prefix "${DCUI_SERVER}" --silent
    echo "✅ DeepClaw UI 服务端依赖已安装"
  fi
  if [ -d "${DCUI_CLIENT}" ]; then
    echo ""
    echo "📦 安装 DeepClaw UI 前端依赖..."
    npm install --prefix "${DCUI_CLIENT}" --silent
    echo "✅ DeepClaw UI 前端依赖已安装"
  fi
else
  echo "⚠️  未找到 npm，请手动安装 DeepClaw UI 依赖："
  echo "   cd ${DCUI_SERVER} && npm install"
  echo "   cd ${DCUI_CLIENT} && npm install"
fi

echo ""
echo "✅ 安装完成！"
echo ""
echo "下一步："
echo "  1. 填写个人配置：${WORKSPACE_DEST}/USER_CONFIG.md"
echo "  2. 重启 OpenClaw：openclaw gateway restart"
echo "  3. 启动 DeepClaw 对话界面（二选一）："
echo "     开发模式（热更新）："
echo "       node ${DCUI_SERVER}/index.js &"
echo "       cd ${DCUI_CLIENT} && npm run dev"
echo "       访问：http://localhost:3000"
echo "     生产模式："
echo "       cd ${DCUI_CLIENT} && npm run build"
echo "       node ${DCUI_SERVER}/index.js"
echo "       访问：http://127.0.0.1:19000"
echo "  4. 输入 @scientist 开始使用"
