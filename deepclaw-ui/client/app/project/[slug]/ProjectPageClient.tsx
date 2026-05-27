'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import LobsterLogo from '@/components/LobsterLogo';
import BladeCursor from '@/components/BladeCursor';
import ChatPanel from '@/components/ChatPanel';
import WorkPanel from '@/components/WorkPanel';
import { fetchProjectMeta, fetchSessions, bindProjectSession, ProjectMeta, SessionMeta } from '@/lib/api';

type PanelMode = 'split' | 'preview' | 'full';

const STATUS_COLOR: Record<string, string> = {
  planning: 'var(--nb-orange)',
  active:   'var(--nb-lime)',
  complete: 'var(--nb-cyan)',
  done:     'var(--nb-cyan)',
};

// ─── Session link dropdown ────────────────────────────────────────────────────

function SessionLinker({ sessions, onBind, onClose }: {
  sessions: SessionMeta[];
  onBind:   (key: string) => void;
  onClose:  () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b"
         style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)', flexWrap: 'wrap',
                  borderBottomWidth: 2 }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
                     textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
        Link Session:
      </span>
      {sessions.length === 0 ? (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>NO SESSIONS</span>
      ) : (
        <div className="flex gap-1.5 flex-wrap">
          {sessions.map(s => (
            <button key={s.key} onClick={() => onBind(s.key)} className="dc-btn-sm">
              {s.label || s.id.slice(0, 10)}
              <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                {s.updatedAt ? new Date(s.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : ''}
              </span>
            </button>
          ))}
        </div>
      )}
      <button onClick={onClose} className="dc-btn-ghost" style={{ marginLeft: 'auto' }}>✕</button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectPageClient() {
  const params        = useParams<{ slug: string }>();
  const slug          = params.slug;
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const initMessage   = searchParams.get('init') ?? undefined;

  const [project, setProject]         = useState<ProjectMeta | null>(null);
  const [sessions, setSessions]       = useState<SessionMeta[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showLink, setShowLink]       = useState(false);
  const [panelMode, setPanelMode]     = useState<PanelMode>('split');
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);

  const handleHtmlPreview = useCallback((html: string) => {
    setHtmlPreview(html);
    setPanelMode(m => m === 'split' ? 'preview' : m);
  }, []);

  const load = useCallback(async () => {
    try {
      const [proj, sess] = await Promise.all([
        fetchProjectMeta(slug),
        fetchSessions('scientist'),
      ]);
      setProject(proj);
      setSessions(sess);
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
    try {
      const sess = await fetchSessions('scientist');
      setSessions(sess);
    } catch { /* keep existing list */ }
  }, [project]);

  const statusColor = STATUS_COLOR[project?.status?.toLowerCase() ?? ''] ?? '#555';
  const linkedSession = sessions.find(s => s.key === project?.sessionKey);
  const sessionId  = linkedSession?.id ?? project?.sessionKey?.split(':').pop() ?? null;
  const sessionKey = project?.sessionKey ?? null;
  const chatW = panelMode === 'split' ? '50%' : panelMode === 'preview' ? '32%' : '22%';

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--text-muted)', letterSpacing: '0.1em',
          textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span className="pulse-dot inline-block"
                style={{ width: 6, height: 6, borderRadius: 0, background: 'var(--nb-cyan)', display: 'inline-block' }} />
          LOADING…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full dc-blade-cursor" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <header className="flex items-center gap-3 px-4 shrink-0"
              style={{ background: 'var(--bg-surface)', borderBottom: '1px solid rgba(255,255,255,0.07)', minHeight: 46 }}>
        {/* Back */}
        <button onClick={() => router.push('/projects')} className="dc-btn-ghost flex items-center gap-1.5" style={{ flexShrink: 0 }}>
          <LobsterLogo size={17} />
          <span style={{ fontFamily: 'var(--font-brand)', fontSize: 14, letterSpacing: '0.06em' }}>DeepClaw</span>
        </button>

        <span style={{ color: 'var(--border)', fontSize: 14, fontFamily: 'var(--font-mono)' }}>/</span>

        {/* Project name */}
        <span style={{
          fontFamily: 'var(--font-brand)', fontSize: 15, letterSpacing: '0.08em',
          color: 'var(--text-primary)', textTransform: 'uppercase', flexShrink: 0,
        }}>
          {slug.replace(/-/g, ' ')}
        </span>

        {/* Status */}
        {project?.status && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
            letterSpacing: '0.12em', padding: '2px 8px',
            background: statusColor, color: '#000',
            textTransform: 'uppercase', flexShrink: 0,
          }}>
            {project.status.toUpperCase()}
          </span>
        )}

        {/* Topic */}
        {project?.topic && (
          <span className="truncate hidden sm:block"
                style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, fontFamily: 'var(--font-mono)' }}>
            {project.topic.slice(0, 60)}
          </span>
        )}

        {/* Session controls */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {sessionKey ? (
            <>
              <span style={{ width: 6, height: 6, borderRadius: 0, background: 'var(--nb-lime)', display: 'inline-block' }} className="pulse-dot" />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
                {linkedSession?.label || sessionKey.split(':').pop()?.slice(0, 10)}
              </span>
              <button onClick={() => setShowLink(o => !o)} className="dc-btn-ghost" style={{ fontSize: 10 }}>
                SWITCH
              </button>
            </>
          ) : (
            <button onClick={() => setShowLink(o => !o)} className="dc-btn dc-btn-primary" style={{ fontSize: 11, padding: '4px 10px' }}>
              LINK SESSION
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
        <div style={{ width: chatW, flexShrink: 0, overflow: 'hidden', transition: 'width 0.3s ease', borderRight: '2px solid var(--border)' }}>
          <ChatPanel
            sessionId={sessionId}
            sessionKey={sessionKey}
            slug={slug}
            initialMessage={initMessage}
            compact={panelMode !== 'split'}
            onSessionCreated={handleSessionCreated}
            onHtmlPreview={handleHtmlPreview}
          />
        </div>
        <div className="flex-1 overflow-hidden" style={{ minWidth: 0 }}>
          <WorkPanel
            slug={slug}
            mode={panelMode}
            htmlPreview={htmlPreview}
            onFileOpen={() => { if (panelMode === 'split') setPanelMode('preview'); }}
            onExpand={() => setPanelMode('full')}
            onCollapse={() => setPanelMode('preview')}
            onClosePreview={() => setPanelMode('split')}
            onClearHtmlPreview={() => { setHtmlPreview(null); setPanelMode('split'); }}
          />
        </div>
      </div>
      <BladeCursor />
    </div>
  );
}
