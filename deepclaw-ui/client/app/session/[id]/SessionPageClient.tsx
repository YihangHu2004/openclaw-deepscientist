'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import LobsterLogo from '@/components/LobsterLogo';
import ChatPanel from '@/components/ChatPanel';
import { fetchProjects, bindProjectSession } from '@/lib/api';

export default function SessionPageClient() {
  const params       = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const sessionId    = decodeURIComponent(params.id);
  const initialQ     = searchParams.get('q') ?? '';

  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [linkedSlug, setLinkedSlug] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  const knownSlugsRef = useRef<Set<string> | null>(null);
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSessionKey(sessionStorage.getItem(`sk-${sessionId}`));
  }, [sessionId]);

  useEffect(() => {
    fetchProjects()
      .then(ps => { knownSlugsRef.current = new Set(ps.map(p => p.slug)); })
      .catch(() => { knownSlugsRef.current = new Set(); });
  }, []);

  const checkForNewProject = useCallback(async () => {
    if (navigating || !knownSlugsRef.current || !sessionKey) return;
    const projects = await fetchProjects().catch(() => []);
    const created  = projects.find(p => !knownSlugsRef.current!.has(p.slug));
    if (!created) return;

    setNavigating(true);
    if (pollRef.current) clearInterval(pollRef.current);
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
      <header className="flex items-center gap-3 px-4 shrink-0"
              style={{ background: 'var(--bg-surface)', borderBottom: '2px solid var(--border)', minHeight: 46 }}>
        <button onClick={() => router.push('/')} className="dc-btn-ghost flex items-center gap-1.5">
          <LobsterLogo size={17} />
          <span style={{ fontFamily: 'var(--font-brand)', fontSize: 14, letterSpacing: '0.06em' }}>DeepClaw</span>
        </button>
        <span style={{ color: 'var(--border)', fontSize: 14, fontFamily: 'var(--font-mono)' }}>/</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
                       letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          NEW SESSION
          <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
            {sessionId.slice(0, 12)}…
          </span>
        </span>

        <div className="flex items-center gap-2 ml-auto">
          {linkedSlug ? (
            <>
              <span className="pulse-dot inline-block"
                    style={{ width: 6, height: 6, borderRadius: 0, background: 'var(--nb-lime)', display: 'inline-block' }} />
              <span style={{ fontSize: 10, color: 'var(--nb-lime)', fontFamily: 'var(--font-mono)',
                             letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                PROJECT CREATED: {linkedSlug} — REDIRECTING…
              </span>
            </>
          ) : (
            <>
              <span className="pulse-dot inline-block"
                    style={{ width: 6, height: 6, borderRadius: 0, background: 'var(--nb-cyan)', display: 'inline-block' }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                             letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                WAITING FOR AI TO CREATE PROJECT…
              </span>
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
