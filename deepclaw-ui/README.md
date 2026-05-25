# DeepClaw UI

Research-grade frontend for OpenClaw/DeepScientist AI agents. Provides real-time chat, project workspace, and file browser, all connected through a local proxy server.

```
Browser ──► Proxy Server (:19000) ──► OpenClaw Gateway (:18789)
              │
              ├─ Serves Next.js static build
              ├─ REST API  /api/sessions  /api/projects  /api/workspace
              └─ WebSocket /ws/gateway   (auth handled server-side)
```

---

## Quick start (one command)

Requires **Node.js ≥ 18** and a running **OpenClaw** installation.

```powershell
# Windows
git clone <repo> deepclaw-ui
cd deepclaw-ui
.\install.ps1
```

```bash
# Mac / Linux
git clone <repo> deepclaw-ui
cd deepclaw-ui
bash install.sh
```

Open **http://127.0.0.1:19000**.

---

## Manual setup — step by step

Use this section if the install script fails, or if you want to understand each step.

### Step 1 — Verify Node.js

```powershell
node --version   # must print v18.x or higher
npm --version
```

If Node.js is missing: download from https://nodejs.org (LTS edition).

---

### Step 2 — Verify OpenClaw is installed

The proxy server reads config from `~/.openclaw/`. OpenClaw must have run at least once.

```powershell
# Windows
Test-Path "$env:USERPROFILE\.openclaw\openclaw.json"   # must print True

# Mac/Linux
test -f ~/.openclaw/openclaw.json && echo "OK" || echo "MISSING"
```

If missing: install OpenClaw and run it once so it creates its config files.

---

### Step 3 — Find your gateway token and port

Open `~/.openclaw/openclaw.json` and locate the `gateway` section:

```json
"gateway": {
    "port":  18789,
    "auth":  {
        "mode":  "token",
        "token": "5cc69cec..."
    }
}
```

Note the **port** (default `18789`) and **token**. The proxy server reads these automatically — you do not need to copy them anywhere. This step is just for verification.

---

### Step 4 — Confirm OpenClaw gateway is running

```powershell
# Windows — check if port 18789 is listening
netstat -ano | findstr :18789
# Expected: TCP  0.0.0.0:18789  ... LISTENING
```

```bash
# Mac/Linux
lsof -i :18789 | grep LISTEN
```

If nothing is listening, start the gateway. On Windows, OpenClaw creates `~/.openclaw/gateway.cmd`:

```powershell
& "$env:USERPROFILE\.openclaw\gateway.cmd"
# Or start it through the OpenClaw app / system tray
```

---

### Step 5 — Install server dependencies

```powershell
cd path\to\deepclaw-ui\server
npm install
```

Expected output ends with something like:
```
added 87 packages in 4s
```

Installed packages: `express`, `ws`, `cors`.

---

### Step 6 — Install client dependencies

```powershell
cd path\to\deepclaw-ui\client
npm install
```

This installs Next.js 15, React 19, and all frontend dependencies (~200 packages, may take 30–60 seconds).

---

### Step 7 — Build the frontend

```powershell
cd path\to\deepclaw-ui\client
$env:NEXT_TELEMETRY_DISABLED = "1"   # optional: disable Next.js telemetry
npm run build
```

Expected output ends with:
```
✓ Compiled successfully
Route (app)    Size
┌ ○ /          ...
└ ○ /project/[slug]  ...
```

The build output goes to `client/out/`. If you skip this step, the proxy server will show a placeholder page and you must use dev mode instead (Step 9b).

---

### Step 8 — Start the proxy server

```powershell
cd path\to\deepclaw-ui\server
node index.js
```

Expected startup output:

```
🔑 Device identity loaded: abc123...
✅ DeepClaw UI: http://127.0.0.1:19000
   WS proxy:    ws://127.0.0.1:19000/ws/gateway → ws://127.0.0.1:18789
   Workspace:   C:\Users\you\.openclaw\workspace-scientist\state\projects
```

Verify the **Workspace** line points to your actual projects directory. If it is wrong, see the Configuration section below.

Open **http://127.0.0.1:19000** in your browser.

---

### Step 9 — Development mode (alternative to Steps 7–8)

If you want live reload while editing the frontend:

**Terminal A — proxy server (with auto-restart on file changes):**
```powershell
cd server
npm run dev     # uses node --watch
```

**Terminal B — Next.js dev server:**
```powershell
cd client
npm run dev     # http://localhost:3000, proxies /api/* to :19000
```

Open **http://localhost:3000** (not port 19000) in dev mode.

---

## Configuration

The proxy server resolves settings in this priority order (first match wins):

### Workspace path resolution

| Priority | Source | Example |
|----------|--------|---------|
| 1 | `OPENCLAW_WORKSPACE` env var | `workspace-research` or `/abs/path` |
| 2 | `~/.openclaw/openclaw.json` → `agents.list` → scientist agent `workspace` field | automatic |
| 3 | Scan `~/.openclaw/workspace-*/state/projects/` | automatic |
| 4 | Hardcoded fallback | `~/.openclaw/workspace-scientist/state/projects` |

In most cases **priority 2 is used** — the workspace path is read directly from `openclaw.json`, which is the same config file OpenClaw manages. No manual action needed.

### All environment variables

| Variable | What it does | Default |
|----------|--------------|---------|
| `DEEPCLAW_UI_PORT` | Port the UI server listens on | `19000` |
| `OPENCLAW_WORKSPACE` | Override workspace: a name (relative to `~/.openclaw/`) or an absolute path to the `projects` directory | auto |

**Windows (PowerShell), set before starting:**
```powershell
$env:DEEPCLAW_UI_PORT    = "18791"
$env:OPENCLAW_WORKSPACE  = "workspace-research"   # or "C:\MyProjects"
node server\index.js
```

**Mac/Linux:**
```bash
DEEPCLAW_UI_PORT=18791 OPENCLAW_WORKSPACE=workspace-research node server/index.js
```

**Persistent (PowerShell profile / .bashrc):**
```powershell
# Windows — add to $PROFILE
$env:DEEPCLAW_UI_PORT = "19000"
```
```bash
# Mac/Linux — add to ~/.bashrc or ~/.zshrc
export DEEPCLAW_UI_PORT=19000
```

---

### Changing the gateway port or token

You never need to set these manually — they are read from `~/.openclaw/openclaw.json`. If the gateway is on a non-standard port, OpenClaw itself updates that file and the proxy server picks up the change on next restart.

If you are running the gateway on a remote machine (advanced), you would need to modify `GATEWAY_WS_URL` in `server/index.js` directly.

---

## Project structure

```
deepclaw-ui/
├── server/
│   ├── index.js          # Express + WebSocket proxy (port 19000)
│   └── package.json
├── client/               # Next.js 15 app
│   ├── app/
│   │   ├── globals.css               # Design system tokens + animations
│   │   ├── page.tsx                  # Landing page: project list
│   │   └── project/[slug]/page.tsx   # Project workspace
│   ├── components/
│   │   ├── LobsterLogo.tsx    # DeepClaw SVG brand mark
│   │   ├── ProjectCard.tsx    # Project list row
│   │   ├── ChatPanel.tsx      # Real-time chat
│   │   ├── MessageBubble.tsx  # Message rendering (markdown, tool calls, thinking)
│   │   ├── ToolCallCard.tsx   # Collapsible tool call display
│   │   ├── InputBar.tsx       # Message input
│   │   └── FileExplorer.tsx   # File tree + preview
│   ├── lib/
│   │   ├── gateway.ts     # WebSocket hook: useGateway
│   │   └── api.ts         # REST API helpers
│   └── next.config.ts     # Dev proxy /api/* → :19000
├── install.ps1            # Windows one-click install
├── install.sh             # Mac/Linux one-click install
├── package.json           # Root-level npm scripts
├── .env.example           # All configurable env vars (copy to .env)
└── .gitignore
```

---

## REST API reference

All endpoints served by the proxy server at port 19000.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | All sessions (`?agent=scientist` to filter) |
| `GET` | `/api/sessions/:id` | Message history for a session |
| `GET` | `/api/sessions/:id/linked-project` | Which project is bound to this session |
| `POST` | `/api/sessions/create` | Create a new session via gateway |
| `GET` | `/api/projects` | All research projects |
| `GET` | `/api/projects/:slug` | Single project metadata |
| `GET` | `/api/projects/:slug/files` | Project file tree |
| `GET` | `/api/projects/:slug/file?path=...` | File content or download |
| `POST` | `/api/projects/:slug/bind-session` | Bind a session key to a project |
| `POST` | `/api/projects/:slug/unbind-session` | Remove session binding |
| `WS` | `/ws/gateway` | WebSocket tunnel to OpenClaw gateway |

---

## Troubleshooting

### "Port 19000 already in use"

```powershell
# Find which process owns port 19000
netstat -ano | findstr :19000
# Kill it (replace 1234 with the actual PID)
taskkill /PID 1234 /F
```

### Workspace shows wrong path at startup

The startup log line `Workspace: ...` tells you which directory the server resolved. If it is wrong:

1. Check `~/.openclaw/openclaw.json` → `agents.list` — find your scientist agent entry and verify the `workspace` field.
2. Or override explicitly:
   ```powershell
   $env:OPENCLAW_WORKSPACE = "C:\exact\path\to\projects"
   node server\index.js
   ```

### Chat shows "未连接到网关"

The gateway is not running. Start it:
```powershell
& "$env:USERPROFILE\.openclaw\gateway.cmd"
```
Then refresh the page — the proxy server reconnects automatically.

### "Could not read openclaw.json"

OpenClaw was never initialized on this machine. Run the OpenClaw app or CLI at least once. It creates `~/.openclaw/openclaw.json` automatically.

### Build fails: "Cannot find module 'next'"

The client dependencies are not installed:
```powershell
cd client
npm install
```

### Frontend shows blank page or 404

The Next.js build is missing. Run:
```powershell
cd client
npm run build
```
Then restart the proxy server.
