#!/usr/bin/env bash
# DeepClaw UI — One-click install script (Mac / Linux)
# Usage: bash install.sh [--dev] [--port 19000] [--no-build] [--no-start]

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DEV=0; PORT=0; NO_BUILD=0; NO_START=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)      DEV=1 ;;
    --port)     PORT="$2"; shift ;;
    --no-build) NO_BUILD=1 ;;
    --no-start) NO_START=1 ;;
  esac
  shift
done

cyan()  { printf "\033[36m  %s\033[0m\n" "$*"; }
green() { printf "\033[32m  OK  %s\033[0m\n" "$*"; }
warn()  { printf "\033[33m  !!  %s\033[0m\n" "$*"; }
fail()  { printf "\033[31m  ERR %s\033[0m\n" "$*"; exit 1; }

echo ""
echo "  DeepClaw UI — Install"
echo "  ─────────────────────────────────────"
echo ""

# ── 1. Check Node.js ──────────────────────────────────────────────────────────

cyan "Checking Node.js..."
if ! command -v node &>/dev/null; then
  fail "Node.js not found. Download from https://nodejs.org (v18+)"
fi
NODE_VER=$(node --version)
MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
if [ "$MAJOR" -lt 18 ]; then
  fail "Node.js $NODE_VER is too old. Requires >= 18."
fi
green "Node.js $NODE_VER"

# ── 2. Check OpenClaw ─────────────────────────────────────────────────────────

cyan "Checking OpenClaw installation..."
OPENCLAW_HOME="${HOME}/.openclaw"
if [ ! -d "$OPENCLAW_HOME" ]; then
  warn ".openclaw not found at $OPENCLAW_HOME — install OpenClaw first."
else
  CFG="$OPENCLAW_HOME/openclaw.json"
  if [ -f "$CFG" ]; then
    GW_PORT=$(python3 -c "import json; d=json.load(open('$CFG')); print(d.get('gateway',{}).get('port',18789))" 2>/dev/null || echo "18789")
    green "OpenClaw config found (gateway port: $GW_PORT)"
  else
    warn "openclaw.json not found — start OpenClaw once first."
  fi
fi

# ── 3. Install server dependencies ────────────────────────────────────────────

cyan "Installing server dependencies..."
SERVER_DIR="$ROOT/server"
[ -d "$SERVER_DIR" ] || fail "server/ directory not found. Run from the deepclaw-ui root."
(cd "$SERVER_DIR" && npm install --prefer-offline --silent 2>/dev/null || npm install --silent)
green "server/node_modules ready"

# ── 4. Install client dependencies ───────────────────────────────────────────

cyan "Installing client dependencies..."
CLIENT_DIR="$ROOT/client"
[ -d "$CLIENT_DIR" ] || fail "client/ directory not found."
(cd "$CLIENT_DIR" && npm install --prefer-offline --silent 2>/dev/null || npm install --silent)
green "client/node_modules ready"

# ── 5. Build Next.js (production) ────────────────────────────────────────────

if [ "$DEV" -eq 0 ] && [ "$NO_BUILD" -eq 0 ]; then
  cyan "Building Next.js frontend (this may take ~60 seconds)..."
  NEXT_TELEMETRY_DISABLED=1
  export NEXT_TELEMETRY_DISABLED
  if (cd "$CLIENT_DIR" && npm run build); then
    green "Frontend built successfully"
  else
    warn "Build failed. Try dev mode: bash install.sh --dev"
  fi
fi

# ── 6. Apply custom port if specified ────────────────────────────────────────

if [ "$PORT" -gt 0 ]; then
  export DEEPCLAW_UI_PORT="$PORT"
  green "UI port set to $PORT"
fi

# ── 7. Start ──────────────────────────────────────────────────────────────────

if [ "$NO_START" -eq 1 ]; then
  echo ""
  echo "  Installation complete."
  echo "  Start the server:  node server/index.js"
  echo ""
  exit 0
fi

UI_PORT=${PORT:-19000}
echo ""
echo "  ─────────────────────────────────────"

if [ "$DEV" -eq 1 ]; then
  echo "  Starting in DEV mode"
  echo "  Proxy server : http://127.0.0.1:19000"
  echo "  Frontend     : http://localhost:3000  (hot reload)"
  echo ""
  echo "  Open two terminals and run:"
  echo "    Terminal 1:  cd server && npm run dev"
  echo "    Terminal 2:  cd client && npm run dev"
  echo ""
else
  echo "  Starting DeepClaw UI..."
  printf "  \033[36mhttp://127.0.0.1:%s\033[0m\n" "$UI_PORT"
  echo "  Press Ctrl+C to stop."
  echo ""
  cd "$SERVER_DIR"
  node index.js
fi
