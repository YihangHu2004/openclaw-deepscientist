const BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://127.0.0.1:19000';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectMeta {
  slug:       string;
  title:      string;
  status:     string;
  createdAt:  string | null;
  topic:      string;
  tags:       string[];
  sessionKey: string | null;
  updatedAt:  number;
}

export interface SessionMeta {
  id:        string;
  key:       string;
  updatedAt: number;
  startedAt: number;
  channel:   string;
  label:     string;
}

export interface SessionHistory {
  sessionId: string;
  messages:  HistoryMessage[];
}

export interface HistoryMessage {
  id:        string;
  parentId?: string;
  timestamp: number;
  role:      'user' | 'assistant';
  content:   unknown[];
}

export interface FileItem {
  name:        string;
  isDirectory: boolean;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<ProjectMeta[]> {
  const res = await fetch(`${BASE}/api/projects`);
  if (!res.ok) throw new Error(`projects: ${res.status}`);
  return res.json();
}

export async function fetchProjectMeta(slug: string): Promise<ProjectMeta> {
  const res = await fetch(`${BASE}/api/projects/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`project: ${res.status}`);
  return res.json();
}

export async function createProject(slug: string): Promise<{ ok: boolean; slug: string }> {
  const res = await fetch(`${BASE}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `create: ${res.status}`);
  return data;
}

export async function bindProjectSession(slug: string, sessionKey: string): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/${encodeURIComponent(slug)}/session`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionKey }),
  });
  if (!res.ok) throw new Error(`bind: ${res.status}`);
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(): Promise<{ sessionId: string; sessionKey: string }> {
  const res = await fetch(`${BASE}/api/sessions/create`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `create session: ${res.status}`);
  // Gateway returns { sessionId, key } — normalize to { sessionId, sessionKey }
  return { sessionId: data.sessionId, sessionKey: data.key ?? data.sessionKey };
}

export async function getSessionLinkedProject(sessionId: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/sessions/${encodeURIComponent(sessionId)}/linked-project`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.slug ?? null;
}

export async function fetchSessions(agent?: string): Promise<SessionMeta[]> {
  const url = `${BASE}/api/sessions${agent ? `?agent=${encodeURIComponent(agent)}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sessions: ${res.status}`);
  return res.json();
}

export async function fetchSessionHistory(id: string): Promise<SessionHistory> {
  const res = await fetch(`${BASE}/api/sessions/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`session history: ${res.status}`);
  return res.json();
}

// ─── Project-scoped files ─────────────────────────────────────────────────────

export async function fetchProjectFiles(slug: string, dirPath = ''): Promise<FileItem[]> {
  const res = await fetch(`${BASE}/api/projects/${encodeURIComponent(slug)}/files?path=${encodeURIComponent(dirPath)}`);
  if (!res.ok) throw new Error(`project files: ${res.status}`);
  return res.json();
}

export function projectFileUrl(slug: string, filePath: string): string {
  return `${BASE}/api/projects/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(filePath)}`;
}

export async function fetchProjectFileText(slug: string, filePath: string): Promise<string> {
  const res = await fetch(projectFileUrl(slug, filePath));
  if (!res.ok) throw new Error(`file: ${res.status}`);
  return res.text();
}

// ─── Legacy workspace file browser (kept for compatibility) ───────────────────

export async function fetchFiles(dirPath = ''): Promise<FileItem[]> {
  const res = await fetch(`${BASE}/api/workspace/files?path=${encodeURIComponent(dirPath)}`);
  if (!res.ok) throw new Error(`files: ${res.status}`);
  return res.json();
}

export function fileUrl(filePath: string): string {
  return `${BASE}/api/workspace/file?path=${encodeURIComponent(filePath)}`;
}
