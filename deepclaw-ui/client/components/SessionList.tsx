'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchSessions, SessionMeta } from '@/lib/api';

// ─── DeepClaw brand logo SVG ──────────────────────────────────────────────────
function DeepClawLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      {/* Claw silhouette */}
      <path d="M14 3 C10 3 7 6 7 10 L7 16 C7 17.5 8 18.5 9 18.5 C10 18.5 11 17.5 11 16 L11 12 C11 10.5 12 9.5 14 9.5 C16 9.5 17 10.5 17 12 L17 16 C17 17.5 18 18.5 19 18.5 C20 18.5 21 17.5 21 16 L21 10 C21 6 18 3 14 3Z"
        fill="#0a7ea4" />
      {/* Circuit lines */}
      <line x1="9" y1="21" x2="9" y2="25" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="14" y1="20" x2="14" y2="25" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="19" y1="21" x2="19" y2="25" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="9" y1="25" x2="19" y2="25" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Teal accent dots */}
      <circle cx="9"  cy="21" r="1.5" fill="#0ea5c9"/>
      <circle cx="14" cy="20" r="1.5" fill="#0ea5c9"/>
      <circle cx="19" cy="21" r="1.5" fill="#0ea5c9"/>
    </svg>
  );
}

// ─── Session wave icon ────────────────────────────────────────────────────────
function SessionIcon({ active }: { active: boolean }) {
  const color = active ? '#0ea5c9' : '#475569';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.5" fill={color} />
      <path d="M4 8 C4 5.8 5.8 4 8 4 C10.2 4 12 5.8 12 8" stroke={color} strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.6"/>
      <path d="M2 8 C2 4.7 4.7 2 8 2 C11.3 2 14 4.7 14 8" stroke={color} strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.3"/>
    </svg>
  );
}

// ─── Channel badge ────────────────────────────────────────────────────────────
const CHANNEL_LABELS: Record<string, string> = {
  'openclaw-weixin': 'WeChat',
  'whatsapp':        'WhatsApp',
  'webchat':         'Web',
  'qqbot':           'QQ',
  'unknown':         '—',
};

function formatTime(ms: number) {
  const d = new Date(ms);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return '昨天';
  if (diffDays < 7)   return `${diffDays}天前`;
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  activeSessionId: string | null;
  onSelect: (session: SessionMeta) => void;
}

export default function SessionList({ activeSessionId, onSelect }: Props) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchSessions();
      setSessions(data);
    } catch (e) {
      console.error('Failed to load sessions', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <aside
      className="flex flex-col h-full dc-scroll-dark"
      style={{ background: 'var(--dc-sidebar)', color: '#e2e8f0', width: 220, flexShrink: 0 }}
    >
      {/* Brand header */}
      <div
        className="flex items-center gap-2 px-4 py-4 border-b"
        style={{ borderColor: '#1e293b' }}
      >
        <DeepClawLogo />
        <span style={{ fontFamily: 'var(--font-brand)', fontWeight: 700, fontSize: 16, color: '#f1f5f9', letterSpacing: '-0.01em' }}>
          DeepClaw
        </span>
      </div>

      {/* Section label */}
      <div className="px-4 pt-4 pb-1" style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
        会话
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto dc-scroll-dark">
        {loading ? (
          <div className="px-4 py-6 text-center" style={{ color: '#475569', fontSize: 13 }}>加载中…</div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-6 text-center" style={{ color: '#475569', fontSize: 13 }}>暂无会话</div>
        ) : (
          sessions.filter(s => s.id).map((s, i) => {
            const isActive = s.id === activeSessionId;
            return (
              <button
                key={s.id || i}
                onClick={() => onSelect(s)}
                className="w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors"
                style={{
                  background: isActive ? 'var(--dc-sidebarhl)' : 'transparent',
                  borderTop: 'none',
                  borderRight: 'none',
                  borderBottom: 'none',
                  borderLeft: isActive ? '2px solid var(--dc-teal)' : '2px solid transparent',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <div className="mt-0.5 shrink-0">
                  <SessionIcon active={isActive} />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate"
                    style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? '#f1f5f9' : '#94a3b8' }}
                  >
                    {s.label || s.id.slice(0, 8)}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span style={{ fontSize: 10, color: '#475569' }}>
                      {CHANNEL_LABELS[s.channel] ?? s.channel}
                    </span>
                    <span style={{ fontSize: 10, color: '#334155' }}>·</span>
                    <span style={{ fontSize: 10, color: '#475569' }}>
                      {s.updatedAt ? formatTime(s.updatedAt) : '—'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Refresh button */}
      <button
        onClick={load}
        className="mx-3 mb-3 mt-1 py-2 rounded-md text-center transition-colors"
        style={{ background: '#1e293b', color: '#64748b', fontSize: 12, cursor: 'pointer', border: 'none' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
        onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
      >
        刷新列表
      </button>
    </aside>
  );
}
