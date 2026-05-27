'use client';

import { useState, useCallback } from 'react';
import { ProjectMeta } from '@/lib/api';

function statusPill(s: string | undefined) {
  if (!s || s.toLowerCase() === 'unknown') {
    return { color: '#888', bg: 'rgba(100,100,100,0.08)', border: 'rgba(100,100,100,0.2)', label: 'Unknown' };
  }
  const v = s.toLowerCase();
  if (v.startsWith('done') || v.startsWith('complete')) {
    return { color: '#818cf8', bg: 'rgba(129,140,248,0.1)', border: 'rgba(129,140,248,0.25)', label: 'Done' };
  }
  return { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)', label: 'In Progress' };
}

function fmt(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 86400000)  return 'Today';
  if (diff < 172800000) return 'Yesterday';
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(ms).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

interface Props {
  project:  ProjectMeta;
  index:    number;
  onClick:  () => void;
  onDelete?: (slug: string) => Promise<void>;
}

export default function ProjectCard({ project, index, onClick, onDelete }: Props) {
  const [jolting,    setJolting]    = useState(false);
  const [hovered,   setHovered]    = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting,  setDeleting]   = useState(false);
  const st = statusPill(project.status);

  const handleClick = useCallback(() => {
    if (confirming) return;
    if ('vibrate' in navigator) navigator.vibrate(20);
    setJolting(true);
    const t = setTimeout(() => { setJolting(false); onClick(); }, 380);
    return () => clearTimeout(t);
  }, [onClick, confirming]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirming(true);
  }, []);

  const handleCancelDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirming(false);
  }, []);

  const handleConfirmDelete = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete(project.slug);
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  }, [onDelete, project.slug, deleting]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); if (!deleting) setConfirming(false); }}
      className={`dc-project-card card-enter w-full text-left${jolting ? ' card-jolt' : ''}${deleting ? ' card-deleting' : ''}`}
      style={{ animationDelay: `${Math.min(index * 50, 320)}ms`, outline: 'none', position: 'relative', cursor: 'pointer' }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '16px 20px',
        gap: 16,
        minHeight: 76,
      }}>
        {/* Index */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-muted)',
          minWidth: 22,
          flexShrink: 0,
          letterSpacing: '0.04em',
          userSelect: 'none',
        }}>
          {String(index + 1).padStart(2, '0')}
        </div>

        {/* Divider */}
        <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{
            fontFamily: 'var(--font-brand)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {project.slug.replace(/-/g, ' ')}
          </div>

          {project.topic && (
            <div style={{
              fontSize: 11.5,
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical' as const,
              fontFamily: 'var(--font-ui)',
            }}>
              {project.topic}
            </div>
          )}

          {project.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {project.tags.slice(0, 4).map(tag => (
                <span key={tag} className="dc-tag">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Meta + delete area */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
          flexShrink: 0,
          minWidth: 96,
        }}>
          {confirming ? (
            /* Inline delete confirmation */
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                 onClick={e => e.stopPropagation()}>
              <span style={{
                fontSize: 9, fontFamily: 'var(--font-mono)',
                color: '#fb7185', letterSpacing: '0.08em',
                textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}>
                {deleting ? '删除中…' : '确认删除?'}
              </span>
              {!deleting && <>
                <button
                  onClick={handleConfirmDelete}
                  style={{
                    padding: '2px 8px', borderRadius: 5, fontSize: 9,
                    border: '1px solid rgba(251,113,133,0.4)',
                    background: 'rgba(251,113,133,0.1)',
                    color: '#fb7185', fontFamily: 'var(--font-mono)',
                    cursor: 'pointer', letterSpacing: '0.06em',
                  }}
                >
                  删除
                </button>
                <button
                  onClick={handleCancelDelete}
                  style={{
                    padding: '2px 8px', borderRadius: 5, fontSize: 9,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'transparent',
                    color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                  }}
                >
                  取消
                </button>
              </>}
            </div>
          ) : (
            <>
              {/* Status pill */}
              <span className="dc-status-chip" style={{
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                letterSpacing: '0.1em',
                padding: '3px 10px',
                background: st.bg,
                color: st.color,
                border: `1px solid ${st.border}`,
                textTransform: 'uppercase',
              }}>
                {st.label}
              </span>

              {/* Session + time */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div className="dc-project-session">
                  <span
                    className={project.sessionKey ? 'dc-session-dot dc-breathing' : 'dc-session-dot'}
                    style={{ '--dot-color': project.sessionKey ? '#34d399' : '#333' } as React.CSSProperties}
                  />
                  {project.sessionKey ? 'Live' : 'Offline'}
                </div>
                <div className="dc-project-time">
                  {project.updatedAt ? fmt(project.updatedAt) : '—'}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete trigger — appears on hover, top-right corner */}
      {onDelete && !confirming && !deleting && (hovered || confirming) && (
        <button
          onClick={handleDeleteClick}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 22, height: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(251,113,133,0.08)',
            border: '1px solid rgba(251,113,133,0.2)',
            borderRadius: 6,
            color: '#fb7185',
            cursor: 'pointer',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 150ms',
            fontSize: 12,
          }}
          title="删除项目"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2 3h7M4.5 3V2h2v1M4 3l.5 6M7 3l-.5 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      <style>{`
        .card-deleting {
          opacity: 0.4;
          pointer-events: none;
          transition: opacity 300ms;
        }
      `}</style>
    </div>
  );
}
