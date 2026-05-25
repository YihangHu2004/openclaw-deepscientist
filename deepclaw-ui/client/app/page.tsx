'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import LobsterLogo from '@/components/LobsterLogo';
import ProjectCard from '@/components/ProjectCard';
import { fetchProjects, createSession, ProjectMeta } from '@/lib/api';

type StatusFilter = 'all' | 'active' | 'planning' | 'done';

// ─── Research input ───────────────────────────────────────────────────────────

function ResearchInput({ onStart }: { onStart: (text: string) => Promise<void> }) {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const inputRef              = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const q = text.trim();
    if (!q || loading) return;
    setLoading(true);
    setError('');
    try { await onStart(q); }
    catch (e) {
      setError(e instanceof Error ? e.message : '网关连接失败');
      setLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, maxWidth: 600 }}>
      <div style={{
        display: 'flex', alignItems: 'center', height: 36,
        background: 'var(--bg-surface)',
        border: '1px solid',
        borderColor: text ? 'rgba(0,200,232,0.4)' : 'var(--border)',
        borderRadius: 4,
        boxShadow: text ? '0 0 0 3px rgba(0,200,232,0.07), inset 0 0 12px rgba(0,200,232,0.04)' : 'none',
        transition: 'border-color 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s cubic-bezier(0.16,1,0.3,1)',
        overflow: 'hidden',
      }}>
        {/* Prompt prefix */}
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--accent)', opacity: 0.7,
          padding: '0 0 0 12px', flexShrink: 0,
          userSelect: 'none',
        }}>›</span>

        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="describe your research objective…"
          disabled={loading}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
            fontSize: 13, fontWeight: 400, padding: '0 10px',
            letterSpacing: '0.01em',
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={!text.trim() || loading}
          style={{
            height: '100%', padding: '0 14px', flexShrink: 0,
            border: 'none', borderLeft: '1px solid var(--border)',
            background: text.trim() && !loading
              ? 'rgba(0,200,232,0.12)' : 'transparent',
            color: text.trim() && !loading ? 'var(--accent)' : 'var(--text-muted)',
            fontFamily: 'var(--font-brand)',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            cursor: text.trim() && !loading ? 'pointer' : 'default',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: 'var(--accent)' }} />
              INIT
            </span>
          ) : 'LAUNCH'}
        </button>
      </div>
      {error && (
        <div style={{ marginTop: 5, fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: '#f87171', letterSpacing: '0.04em' }}>
          ERR: {error}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar section label ────────────────────────────────────────────────────

function SideLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="dc-label" style={{ padding: '0 8px', marginBottom: 6 }}>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const [projects, setProjects]         = useState<ProjectMeta[]>([]);
  const [query, setQuery]               = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading]           = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProjects(await fetchProjects()); }
    catch (e) { console.error('fetch projects failed', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = projects.filter(p => {
    const q = query.toLowerCase();
    const matchesQuery = !query ||
      p.slug.includes(q) || p.topic.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q));
    const matchesStatus = statusFilter === 'all' ||
      p.status?.toLowerCase() === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const handleStart = async (text: string) => {
    const session = await createSession();
    sessionStorage.setItem(`sk-${session.sessionId}`, session.sessionKey);
    router.push(`/session/${encodeURIComponent(session.sessionId)}?q=${encodeURIComponent(text)}`);
  };

  const statusCounts = {
    all:      projects.length,
    active:   projects.filter(p => p.status?.toLowerCase() === 'active').length,
    planning: projects.filter(p => p.status?.toLowerCase() === 'planning').length,
    done:     projects.filter(p => ['done', 'complete'].includes(p.status?.toLowerCase())).length,
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-base)' }}>
      {/* Global grain overlay */}
      <div className="dc-grain" aria-hidden />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Dot grid texture */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, rgba(0,200,232,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />

        <div className="flex items-center gap-4 px-5" style={{ height: 52, position: 'relative', zIndex: 1 }}>
          {/* Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <LobsterLogo size={26} />
            <div>
              <div className="dc-flicker" style={{
                fontFamily: 'var(--font-brand)',
                fontSize: 20, fontWeight: 800,
                color: 'var(--text-primary)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                lineHeight: 1,
              }}>
                DeepClaw
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8, color: 'var(--accent)',
                letterSpacing: '0.14em', marginTop: 2,
                opacity: 0.8,
              }}>
                SCIENTIST · RESEARCH STUDIO
              </div>
            </div>
          </div>

          {/* Separator */}
          <div style={{ width: 1, height: 28, background: 'var(--border-subtle)', flexShrink: 0 }} />

          {/* Research input */}
          <ResearchInput onStart={handleStart} />

          {/* Status ping */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: '#10b981' }} />
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: '#10b981', letterSpacing: '0.08em',
            }}>SYS:OK</span>
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside style={{
          width: 196, flexShrink: 0,
          borderRight: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          display: 'flex', flexDirection: 'column',
          padding: '16px 10px',
          overflowY: 'auto',
        }} className="dc-scroll">

          {/* Search */}
          <div style={{ marginBottom: 22 }}>
            <SideLabel>Search</SideLabel>
            <div style={{ position: 'relative' }}>
              <svg style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                   width="11" height="11" viewBox="0 0 11 11" fill="none">
                <circle cx="4.5" cy="4.5" r="3" stroke="var(--text-muted)" strokeWidth="1.2"/>
                <line x1="7" y1="7" x2="10" y2="10" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <input
                className="dc-input"
                style={{ paddingLeft: 24, fontSize: 12, height: 28, borderRadius: 3 }}
                placeholder="filter…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Status filter */}
          <div style={{ marginBottom: 22 }}>
            <SideLabel>Status</SideLabel>
            {([
              ['all',      'All'],
              ['active',   'Active'],
              ['planning', 'Planning'],
              ['done',     'Done'],
            ] as [StatusFilter, string][]).map(([s, label]) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`dc-sidebar-filter${statusFilter === s ? ' active' : ''}`}
                style={{ fontSize: 12, justifyContent: 'space-between' }}
              >
                <span>{label}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  color: statusFilter === s ? 'var(--accent)' : 'var(--text-muted)',
                  opacity: 0.7,
                }}>
                  {statusCounts[s]}
                </span>
              </button>
            ))}
          </div>

          {/* Bottom */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-muted)', letterSpacing: '0.06em',
              padding: '0 8px', marginBottom: 8,
            }}>
              {loading ? 'LOADING…' : `${filtered.length} / ${projects.length} ITEMS`}
            </div>
            <button onClick={load} className="dc-sidebar-filter" style={{ fontSize: 11 }}>
              Refresh
            </button>
          </div>
        </aside>

        {/* Project list */}
        <main className="flex-1 overflow-y-auto dc-scroll" style={{ padding: '12px 14px' }}>

          {/* List header */}
          {!loading && filtered.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr 100px',
              padding: '0 20px 8px',
              marginBottom: 2,
            }}>
              {['#', 'Project', 'Meta'].map(h => (
                <span key={h} className="dc-label">{h}</span>
              ))}
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card-enter" style={{
                  height: 80, borderRadius: 5,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  animationDelay: `${i * 60}ms`,
                }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 14,
            }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" opacity={0.3}>
                <circle cx="24" cy="24" r="18" stroke="var(--accent)" strokeWidth="1"/>
                <circle cx="24" cy="24" r="10" stroke="var(--accent)" strokeWidth="0.5"/>
                <circle cx="24" cy="24" r="2"  fill="var(--accent)"/>
                <line x1="24" y1="6" x2="24" y2="2"  stroke="var(--accent)" strokeWidth="1"/>
                <line x1="24" y1="46" x2="24" y2="42" stroke="var(--accent)" strokeWidth="1"/>
                <line x1="6" y1="24"  x2="2" y2="24"  stroke="var(--accent)" strokeWidth="1"/>
                <line x1="46" y1="24" x2="42" y2="24" stroke="var(--accent)" strokeWidth="1"/>
              </svg>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 11,
                color: 'var(--text-muted)', letterSpacing: '0.08em', textAlign: 'center',
              }}>
                {query ? `NO MATCH: "${query.toUpperCase()}"` : 'NO PROJECTS — LAUNCH A RESEARCH ABOVE'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map((p, i) => (
                <ProjectCard
                  key={p.slug}
                  project={p}
                  index={i}
                  onClick={() => router.push(`/project/${p.slug}`)}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
