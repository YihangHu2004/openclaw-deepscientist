# DeepClaw UI

Local frontend for OpenClaw / DeepScientist AI agents. Provides real-time chat, project workspace, and file browser.

```
Browser ──► Proxy Server (:19000) ──► OpenClaw Gateway (:18789)
              │
              ├─ Spawns Next.js internally (auto dev or prod mode)
              ├─ REST API   /api/sessions  /api/projects  /api/workspace
              └─ WebSocket  /ws/gateway   (auth handled server-side)
```

Requires **Node.js ≥ 18** and a running **OpenClaw** installation.

---

## Quick start

```powershell
# Windows
git clone <repo> deepclaw-ui && cd deepclaw-ui
.\install.ps1
```

```bash
# Mac / Linux
git clone <repo> deepclaw-ui && cd deepclaw-ui
bash install.sh
```

Open **http://127.0.0.1:19000**.

The install script installs dependencies, builds the frontend, and starts the server. The server spawns Next.js automatically — no separate process needed.

---

## How it works

`node server/index.js` does everything in a single process:

1. Starts an Express server on port 19000.
2. Checks whether a production build exists (`client/.next/BUILD_ID`).
   - Build found → spawns `next start` on port 20000 (fast, production mode).
   - No build → spawns `next dev` on port 20000 (hot reload, slower startup).
3. Proxies all HTTP requests (except `/api/*`) to the Next.js process.
4. Handles `/api/*` routes directly (sessions, projects, workspace files).
5. Tunnels `/ws/gateway` WebSocket connections to the OpenClaw gateway, adding authentication server-side.

You always open **http://127.0.0.1:19000** — not the Next.js port directly.

---

## Manual setup

### 1. Verify Node.js

```powershell
node --version   # must be v18 or higher
```

Download from https://nodejs.org (LTS) if missing.

### 2. Verify OpenClaw config exists

```powershell
# Windows
Test-Path "$env:USERPROFILE\.openclaw\openclaw.json"   # must print True
# Mac/Linux
test -f ~/.openclaw/openclaw.json && echo OK || echo MISSING
```

If missing: run the OpenClaw app or CLI once — it creates the config automatically.

### 3. Install dependencies

```powershell
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### 4. Build the frontend (recommended for production use)

```powershell
cd client
npm run build
```

Generates `client/.next/`. Without this step the server falls back to dev mode automatically — functional but slower to start.

### 5. Start

```powershell
cd server
node index.js
```

Expected output:
```
🔑 Device identity loaded: abc123...
[next] START on port 20000
✅ DeepClaw UI: http://127.0.0.1:19000
   Next.js:     http://127.0.0.1:20000 (proxied)
   WS proxy:    ws://127.0.0.1:19000/ws/gateway → ws://127.0.0.1:18789
   Workspace:   C:\Users\you\.openclaw\workspace-scientist\state\projects
```

Check the **Workspace** line — it must point to your actual projects directory. See Configuration below if it is wrong.

---

## Dev mode (hot reload)

Skip the build step. The server will auto-start Next.js in dev mode when no build is found:

```powershell
# Remove stale build if one exists, then start
Remove-Item -ErrorAction SilentlyContinue client\.next\BUILD_ID
cd server && node index.js
```

Or use the install script flag:

```powershell
.\install.ps1 -Dev
```

Open **http://127.0.0.1:19000**. Changes to files in `client/` take effect on page reload without restarting the server.

---

## Configuration

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `DEEPCLAW_UI_PORT` | `19000` | Port the UI server listens on |
| `OPENCLAW_WORKSPACE` | auto | Override workspace path: a name relative to `~/.openclaw/` (e.g. `workspace-research`) or an absolute path to the `projects/` directory |

Set before starting:

```powershell
# Windows
$env:DEEPCLAW_UI_PORT   = "19000"
$env:OPENCLAW_WORKSPACE = "workspace-research"
node server\index.js
```

```bash
# Mac/Linux
DEEPCLAW_UI_PORT=19000 OPENCLAW_WORKSPACE=workspace-research node server/index.js
```

### Workspace path resolution

The server resolves the workspace directory in this order:

1. `OPENCLAW_WORKSPACE` env var
2. `~/.openclaw/openclaw.json` → `agents.list` → scientist agent `workspace` field
3. Scan `~/.openclaw/workspace-*/state/projects/`
4. Fallback: `~/.openclaw/workspace-scientist/state/projects`

In a standard OpenClaw install, priority 2 resolves automatically.

### Gateway port and token

Read automatically from `~/.openclaw/openclaw.json`. No manual configuration needed.

---

## Project structure

```
deepclaw-ui/
├── server/
│   ├── index.js        # Proxy server: Express + WS tunnel + Next.js spawn
│   └── package.json
├── client/             # Next.js 15 app (React 19, TypeScript, Tailwind)
│   ├── app/
│   │   ├── page.tsx                      # Landing page
│   │   ├── projects/page.tsx             # Project list
│   │   └── project/[slug]/               # Project workspace
│   ├── components/
│   │   ├── LobsterLogo.tsx               # Brand mark
│   │   ├── ChatPanel.tsx                 # Real-time chat
│   │   ├── MessageBubble.tsx             # Message rendering (markdown, tools, thinking)
│   │   ├── WorkPanel.tsx                 # File browser + preview
│   │   ├── BladeCursor.tsx               # Custom cursor for inner pages
│   │   └── InputBar.tsx                  # Message input
│   ├── lib/
│   │   ├── gateway.ts                    # WebSocket hook
│   │   └── api.ts                        # REST helpers
│   └── next.config.ts
├── install.ps1         # Windows one-click setup
├── install.sh          # Mac/Linux one-click setup
└── .gitignore
```

---

## REST API

All served by the proxy server at port 19000.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sessions` | All sessions |
| `GET` | `/api/sessions/:id` | Message history for a session |
| `GET` | `/api/sessions/:id/linked-project` | Project bound to this session |
| `POST` | `/api/sessions/create` | Create a new session via gateway |
| `GET` | `/api/projects` | All research projects |
| `GET` | `/api/projects/:slug` | Single project metadata |
| `GET` | `/api/projects/:slug/files` | Project file tree |
| `GET` | `/api/projects/:slug/file?path=...` | File content |
| `POST` | `/api/projects/:slug/bind-session` | Bind a session to a project |
| `WS` | `/ws/gateway` | WebSocket tunnel to OpenClaw gateway |

---

## Troubleshooting

**Port 19000 already in use**
```powershell
netstat -ano | findstr :19000   # find PID
taskkill /PID <pid> /F
```

**Workspace path is wrong at startup**

Check `~/.openclaw/openclaw.json` → `agents.list` → scientist agent `workspace` field. Or override:
```powershell
$env:OPENCLAW_WORKSPACE = "C:\exact\path\to\projects"
node server\index.js
```

**Chat shows "未连接到网关"**

The OpenClaw gateway is not running. Start it:
```powershell
& "$env:USERPROFILE\.openclaw\gateway.cmd"
```
Then refresh — the proxy reconnects automatically.

**"Could not read openclaw.json"**

OpenClaw has not been initialized on this machine. Run it once to generate the config file.

**Next.js fails to start**

Client dependencies are missing:
```powershell
cd client && npm install
```
