const BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://127.0.0.1:18791';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionMeta {
  id:        string;
  key:       string;   // full session key for sessions.send
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

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function fetchSessions(): Promise<SessionMeta[]> {
  const res = await fetch(`${BASE}/api/sessions`);
  if (!res.ok) throw new Error(`sessions: ${res.status}`);
  return res.json();
}

export async function fetchSessionHistory(id: string): Promise<SessionHistory> {
  const res = await fetch(`${BASE}/api/sessions/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`session history: ${res.status}`);
  return res.json();
}

// ─── File browser ─────────────────────────────────────────────────────────────

export async function fetchFiles(dirPath = ''): Promise<FileItem[]> {
  const res = await fetch(`${BASE}/api/workspace/files?path=${encodeURIComponent(dirPath)}`);
  if (!res.ok) throw new Error(`files: ${res.status}`);
  return res.json();
}

export function fileUrl(filePath: string): string {
  return `${BASE}/api/workspace/file?path=${encodeURIComponent(filePath)}`;
}

export async function fetchFileText(filePath: string): Promise<string> {
  const res = await fetch(fileUrl(filePath));
  if (!res.ok) throw new Error(`file: ${res.status}`);
  return res.text();
}
