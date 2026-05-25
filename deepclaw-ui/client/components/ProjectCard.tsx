'use client';

import { useState, useCallback } from 'react';
import { ProjectMeta } from '@/lib/api';

const STATUS: Record<string, { color: string; bg: string; border: string; label: string }> = {
  planning: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)', label: 'Planning' },
  active:   { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.25)',  label: 'Active'   },
  complete: { color: '#818cf8', bg: 'rgba(129,140,248,0.1)', border: 'rgba(129,140,248,0.25)', label: 'Done'     },
  done:     { color: '#818cf8', bg: 'rgba(129,140,248,0.1)', border: 'rgba(129,140,248,0.25)', label: 'Done'     },
};

function fmt(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 86400000)  return 'Today';
  if (diff < 172800000) return 'Yesterday';
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(ms).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

interface Props {
  project: ProjectMeta;
  index:   number;
  onClick: () => void;
}

export default function ProjectCard({ project, index, onClick }: Props) {
  const [jolting, setJolting] = useState(false);
  const st = STATUS[project.status?.toLowerCase()] ?? {
    color: '#666', bg: 'rgba(100,100,100,0.08)', border: 'rgba(100,100,100,0.2)', label: 'Unknown',
  };

  const handleClick = useCallback(() => {
    if ('vibrate' in navigator) navigator.vibrate(20);
    setJolting(true);
    const t = setTimeout(() => { setJolting(false); onClick(); }, 380);
    return () => clearTimeout(t);
  }, [onClick]);

  return (
    <button
      onClick={handleClick}
      className={`dc-project-card card-enter w-full text-left${jolting ? ' card-jolt' : ''}`}
      style={{ animationDelay: `${Math.min(index * 50, 320)}ms`, outline: 'none' }}
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

        {/* Meta */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
          flexShrink: 0,
          minWidth: 96,
        }}>
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
              {project.sessionKey ? 'Live' : 'Idle'}
            </div>
            <div className="dc-project-time">
              {project.updatedAt ? fmt(project.updatedAt) : '—'}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
