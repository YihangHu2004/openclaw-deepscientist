'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import LobsterLogo from '@/components/LobsterLogo';
import ChatPanel from '@/components/ChatPanel';
import { fetchProjects, bindProjectSession } from '@/lib/api';

export default function SessionPage() {
  const params       = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const sessionId    = decodeURIComponent(params.id);
  const initialQ     = searchParams.get('q') ?? '';

  const [sessionKey, setSessionKey]     = useState<string | null>(null);
  const [linkedSlug, setLinkedSlug]     = useState<string | null>(null);
  const [navigating, setNavigating]     = useState(false);
  // Slugs that existed before this session started — new ones were created by the AI
  const knownSlugsRef = useRef<Set<string> | null>(null);
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  // Retrieve session key stored by landing page
  useEffect(() => {
    setSessionKey(sessionStorage.getItem(`sk-${sessionId}`));
  }, [sessionId]);

  // Snapshot existing projects on mount so we can detect newly created ones
  useEffect(() => {
    fetchProjects()
      .then(ps => { knownSlugsRef.current = new Set(ps.map(p => p.slug)); })
      .catch(() => { knownSlugsRef.current = new Set(); });
  }, []);

  // Poll: find any project that appeared AFTER this session started
  const checkForNewProject = useCallback(async () => {
    if (navigating || !knownSlugsRef.current || !sessionKey) return;
    const projects = await fetchProjects().catch(() => []);
    const created  = projects.find(p => !knownSlugsRef.current!.has(p.slug));
    if (!created) return;

    setNavigating(true);
    if (pollRef.current) clearInterval(pollRef.current);

    // Auto-bind this session to the new project
    await bindProjectSession(created.slug, sessionKey).catch(console.error);
    setLinkedSlug(created.slug);
    setTimeout(() => router.push(`/project/${created.slug}`), 1000);
  }, [navigating, sessionKey, router]);

  useEffect(() => {
    pollRef.current = setInterval(checkForNewProject, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [checkForNewProject]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <header className="flex items-center gap-2.5 px-4 py-2.5 border-b shrink-0"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', minHeight: 46 }}>
        <button onClick={() => router.push('/')} className="dc-btn-ghost flex items-center gap-1.5">
          <LobsterLogo size={18} />
          <span style={{ fontSize: 12 }}>DeepClaw</span>
        </button>
        <span style={{ color: 'var(--border)', fontSize: 14 }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          新会话
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
            {sessionId.slice(0, 12)}…
          </span>
        </span>

        <div className="flex items-center gap-2 ml-auto">
          {linkedSlug ? (
            <>
              <span className="pulse-dot inline-block w-2 h-2 rounded-full" style={{ background: '#10b981' }} />
              <span style={{ fontSize: 11, color: '#10b981' }}>
                已创建项目 <strong>{linkedSlug}</strong>，跳转中…
              </span>
            </>
          ) : (
            <>
              <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>等待 AI 创建项目…</span>
            </>
          )}
        </div>
      </header>

      {/* Chat */}
      <div className="flex-1 overflow-hidden">
        <ChatPanel
          sessionId={sessionId}
          sessionKey={sessionKey}
          initialMessage={initialQ || undefined}
        />
      </div>
    </div>
  );
}
