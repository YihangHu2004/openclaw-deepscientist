'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import LobsterLogo from '@/components/LobsterLogo';
import ChatPanel from '@/components/ChatPanel';
import WorkPanel from '@/components/WorkPanel';
import { fetchProjectMeta, fetchSessions, bindProjectSession, ProjectMeta, SessionMeta } from '@/lib/api';

type PanelMode = 'split' | 'preview' | 'full';

const STATUS_COLOR: Record<string, string> = {
  planning: '#f59e0b',
  active:   '#10b981',
  complete: '#3b82f6',
  done:     '#3b82f6',
};

// ─── Session link dropdown ────────────────────────────────────────────────────

function SessionLinker({ sessions, onBind, onClose }: {
  sessions: SessionMeta[];
  onBind:   (key: string) => void;
  onClose:  () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b"
         style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>
        选择 Scientist Session：
      </span>
      {sessions.length === 0 ? (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>无可用 Session</span>
      ) : (
        <div className="flex gap-1.5 flex-wrap">
          {sessions.map(s => (
            <button key={s.key} onClick={() => onBind(s.key)}
                    className="dc-btn-sm" style={{ fontSize: 11 }}>
              {s.label || s.id.slice(0, 10)}
              <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                {s.updatedAt ? new Date(s.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : ''}
              </span>
            </button>
          ))}
        </div>
      )}
      <button onClick={onClose} className="dc-btn-ghost" style={{ marginLeft: 'auto', fontSize: 12 }}>✕</button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectPage() {
  const params = useParams<{ slug: string }>();
  const slug   = params.slug;
  const router = useRouter();

  const [project, setProject]     = useState<ProjectMeta | null>(null);
  const [sessions, setSessions]   = useState<SessionMeta[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showLink, setShowLink]   = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('split');

  const load = useCallback(async () => {
    try {
      const [proj, sess] = await Promise.all([
        fetchProjectMeta(slug),
        fetchSessions('scientist'),
      ]);
      setProject(proj);
      setSessions(sess);

      // No auto-bind here — user creates session explicitly via ChatPanel button
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const handleBind = async (sessionKey: string) => {
    if (!project) return;
    await bindProjectSession(slug, sessionKey);
    setProject({ ...project, sessionKey });
    setShowLink(false);
  };

  const handleSessionCreated = useCallback(async (newSessionId: string, newSessionKey: string) => {
    if (!project) return;
    setProject({ ...project, sessionKey: newSessionKey });
    // Refresh sessions list so linkedSession lookup finds the new one
    try {
      const sess = await fetchSessions('scientist');
      setSessions(sess);
    } catch { /* keep existing list */ }
  }, [project]);

  const statusColor = STATUS_COLOR[project?.status?.toLowerCase() ?? ''] ?? '#475569';

  // Derive sessionId from sessionKey (last colon-segment or the key itself)
  const linkedSession = sessions.find(s => s.key === project?.sessionKey);
  const sessionId  = linkedSession?.id ?? project?.sessionKey?.split(':').pop() ?? null;
  const sessionKey = project?.sessionKey ?? null;

  // Chat width: split=50%, preview=32%, full=22%
  const chatW = panelMode === 'split' ? '50%' : panelMode === 'preview' ? '32%' : '22%';

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>加载中…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <header className="flex items-center gap-2.5 px-4 py-2.5 border-b shrink-0"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', minHeight: 46 }}>
        {/* Back */}
        <button onClick={() => router.push('/')} className="dc-btn-ghost flex items-center gap-1.5" style={{ flexShrink: 0 }}>
          <LobsterLogo size={18} />
          <span style={{ fontSize: 12 }}>DeepClaw</span>
        </button>

        <span style={{ color: 'var(--border)', fontSize: 14 }}>/</span>

        {/* Project name */}
        <span style={{ fontFamily: 'var(--font-brand)', fontSize: 14, fontWeight: 600,
                       color: 'var(--text-primary)', flexShrink: 0 }}>
          {slug}
        </span>

        {/* Status badge */}
        {project?.status && (
          <span className="dc-badge" style={{ '--badge-color': statusColor } as React.CSSProperties}>
            {project.status}
          </span>
        )}

        {/* Topic excerpt */}
        {project?.topic && (
          <span className="truncate hidden sm:block"
                style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
            {project.topic.slice(0, 60)}
          </span>
        )}

        {/* Session info / link */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {sessionKey ? (
            <>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}/>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {linkedSession?.label || sessionKey.split(':').pop()?.slice(0, 10)}
              </span>
              <button onClick={() => setShowLink(o => !o)} className="dc-btn-ghost" style={{ fontSize: 11 }}>
                切换
              </button>
            </>
          ) : (
            <button onClick={() => setShowLink(o => !o)} className="dc-btn dc-btn-primary" style={{ fontSize: 12, padding: '4px 10px' }}>
              链接 Session
            </button>
          )}
        </div>
      </header>

      {/* Session linker bar */}
      {showLink && (
        <SessionLinker sessions={sessions} onBind={handleBind} onClose={() => setShowLink(false)} />
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat panel */}
        <div style={{ width: chatW, flexShrink: 0, overflow: 'hidden', transition: 'width 0.3s ease' }}>
          <ChatPanel
            sessionId={sessionId}
            sessionKey={sessionKey}
            slug={slug}
            onSessionCreated={handleSessionCreated}
          />
        </div>

        {/* Work panel (takes remaining width) */}
        <div className="flex-1 overflow-hidden" style={{ minWidth: 0 }}>
          <WorkPanel
            slug={slug}
            mode={panelMode}
            onFileOpen={() => { if (panelMode === 'split') setPanelMode('preview'); }}
            onExpand={() => setPanelMode('full')}
            onCollapse={() => setPanelMode('preview')}
            onClosePreview={() => setPanelMode('split')}
          />
        </div>
      </div>
    </div>
  );
}
