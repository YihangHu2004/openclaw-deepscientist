# DeepClaw UI — Client

Next.js 15 frontend for DeepClaw. Do not start this directly.

The proxy server (`server/index.js`) spawns this process automatically. See the [root README](../README.md) for setup instructions.

---

## Development

If you need to run the client in isolation (e.g. UI-only work):

```powershell
cd client
npm install
npm run dev   # http://localhost:3000
```

API calls (`/api/*`) are proxied to `http://127.0.0.1:19000` — the proxy server must be running for chat and project data to work.

## Build

```powershell
cd client
npm run build
```

Output goes to `client/.next/`. The proxy server detects this build and uses `next start` instead of `next dev` on next launch.
