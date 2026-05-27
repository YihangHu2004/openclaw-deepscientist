'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import LobsterLogo from '@/components/LobsterLogo';
import ProjectCard from '@/components/ProjectCard';
import LaunchDialog from '@/components/LaunchDialog';
import BladeCursor from '@/components/BladeCursor';
import { fetchProjects, deleteProject, ProjectMeta } from '@/lib/api';

type StatusFilter = 'all' | 'inprogress' | 'done';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontFamily: 'var(--font-mono)',
      letterSpacing: '0.16em', textTransform: 'uppercase',
      color: 'var(--text-muted)', marginBottom: 8, padding: '0 4px',
    }}>
      {children}
    </div>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects]         = useState<ProjectMeta[]>([]);
  const [query, setQuery]               = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading]           = useState(true);
  const [dialogOpen, setDialogOpen]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProjects(await fetchProjects()); }
    catch (e) { console.error('fetch projects failed', e); }
    finally { setLoading(false); }
  }, []);

  const handleDelete = useCallback(async (slug: string) => {
    await deleteProject(slug);
    setProjects(prev => prev.filter(p => p.slug !== slug));
  }, []);

   
  useEffect(() => { load(); }, [load]);

  const classifyStatus = (s: string | undefined): 'inprogress' | 'done' | 'unknown' => {
    if (!s || s.toLowerCase() === 'unknown') return 'unknown';
    const v = s.toLowerCase();
    if (v.startsWith('done') || v.startsWith('complete')) return 'done';
    return 'inprogress';
  };

  const filtered = projects.filter(p => {
    const q = query.toLowerCase();
    const matchesQuery = !query ||
      p.slug.includes(q) || p.topic.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q));
    const cls = classifyStatus(p.status);
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'inprogress' && cls === 'inprogress') ||
      (statusFilter === 'done' && cls === 'done');
    return matchesQuery && matchesStatus;
  });

  const counts = {
    all:      projects.length,
    inprogress: projects.filter(p => classifyStatus(p.status) === 'inprogress').length,
    done:     projects.filter(p => classifyStatus(p.status) === 'done').length,
  };

  return (
    <div className="flex flex-col h-full dc-blade-cursor" style={{ background: 'var(--bg-base)' }}>
      <div className="dc-grain" aria-hidden />

      {/* Header */}
      <header style={{
        flexShrink: 0,
        padding: '0 20px',
        height: 50,
        display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(5,5,5,0.85)',
        backdropFilter: 'blur(12px)',
        position: 'relative', zIndex: 10,
      }}>
        <button
          onClick={() => router.push('/')}
          className="dc-btn-ghost"
          style={{ gap: 7, padding: '4px 10px' }}
        >
          <LobsterLogo size={17} />
          <span style={{ fontFamily: 'var(--font-brand)', fontSize: 13, letterSpacing: '0.1em' }}>DeepClaw</span>
        </button>

        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />

        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--text-muted)', letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          Projects
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Item count */}
          {!loading && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-muted)', letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              {filtered.length}/{projects.length}
            </span>
          )}
          <button onClick={load} className="dc-btn-ghost" style={{ fontSize: 11 }}>
            ↻
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="dc-btn dc-btn-primary"
            style={{ fontSize: 11, padding: '5px 14px' }}
          >
            + Launch
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside style={{
          width: 188, flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: 'var(--bg-surface)',
          display: 'flex', flexDirection: 'column',
          padding: '16px 10px',
          overflowY: 'auto',
        }} className="dc-scroll">

          {/* Search */}
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>Search</SectionLabel>
            <div style={{ position: 'relative' }}>
              <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                   width="11" height="11" viewBox="0 0 11 11" fill="none">
                <circle cx="4.5" cy="4.5" r="3.5" stroke="var(--text-muted)" strokeWidth="1.3"/>
                <line x1="7.5" y1="7.5" x2="10" y2="10" stroke="var(--text-muted)" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <input
                className="dc-input"
                style={{ paddingLeft: 28, height: 32, fontSize: 11 }}
                placeholder="Search…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Status filter */}
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>Status</SectionLabel>
            {([
              ['all',      'All'],
              ['inprogress', 'In Progress'],
              ['done',     'Done'],
            ] as [StatusFilter, string][]).map(([s, label]) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`dc-sidebar-filter${statusFilter === s ? ' active' : ''}`}
              >
                <span style={{ flex: 1 }}>{label}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  color: statusFilter === s ? 'var(--cm-emerald)' : 'var(--text-muted)',
                  background: statusFilter === s ? 'rgba(52,211,153,0.1)' : 'transparent',
                  border: `1px solid ${statusFilter === s ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  padding: '1px 6px', borderRadius: 4, minWidth: 20, textAlign: 'center',
                }}>
                  {counts[s]}
                </span>
              </button>
            ))}
          </div>

          {/* Bottom actions */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
            <button
              onClick={() => setDialogOpen(true)}
              className="dc-sidebar-filter"
              style={{ color: 'var(--cm-emerald)', opacity: 0.8 }}
            >
              + New Project
            </button>
          </div>
        </aside>

        {/* Project list */}
        <main className="flex-1 overflow-y-auto dc-scroll" style={{ padding: '12px 16px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card-enter" style={{
                  height: 76,
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 14,
                  animationDelay: `${i * 60}ms`,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(52,211,153,0.03) 50%, transparent)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.8s infinite',
                    animationDelay: `${i * 120}ms`,
                  }} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              height: 'calc(100% - 40px)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 16,
            }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="10"  fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5"/>
                <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
                <circle cx="24" cy="24" r="4" fill="rgba(255,255,255,0.06)"/>
              </svg>
              <div style={{
                fontSize: 12, color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                textTransform: 'uppercase', textAlign: 'center',
              }}>
                {query ? `No match: "${query}"` : 'No projects yet'}
              </div>
              {!query && (
                <button onClick={() => setDialogOpen(true)} className="dc-btn dc-btn-primary" style={{ fontSize: 11 }}>
                  Launch First Project
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map((p, i) => (
                <ProjectCard
                  key={p.slug}
                  project={p}
                  index={i}
                  onClick={() => router.push(`/project/${p.slug}`)}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <LaunchDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />

      <BladeCursor />
    </div>
  );
}
