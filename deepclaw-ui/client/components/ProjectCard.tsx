'use client';

import { useState, useCallback } from 'react';
import { ProjectMeta } from '@/lib/api';

const STATUS: Record<string, { color: string; label: string }> = {
  planning: { color: '#f59e0b', label: 'PLAN' },
  active:   { color: '#10b981', label: 'ACTV' },
  complete: { color: '#3b82f6', label: 'DONE' },
  done:     { color: '#3b82f6', label: 'DONE' },
};

function fmt(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 86400000)  return 'TODAY';
  if (diff < 172800000) return 'YEST';
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}D AGO`;
  return new Date(ms).toLocaleDateString('en', { month: 'short', day: 'numeric' }).toUpperCase();
}

interface Props {
  project: ProjectMeta;
  index:   number;
  onClick: () => void;
}

export default function ProjectCard({ project, index, onClick }: Props) {
  const [jolting, setJolting] = useState(false);
  const st = STATUS[project.status?.toLowerCase()] ?? { color: '#475569', label: 'UNKN' };
  const num = String(index + 1).padStart(2, '0');

  const handleClick = useCallback(() => {
    if ('vibrate' in navigator) navigator.vibrate(18);
    setJolting(true);
    const t = setTimeout(() => {
      setJolting(false);
      onClick();
    }, 300);
    return () => clearTimeout(t);
  }, [onClick]);

  return (
    <button
      onClick={handleClick}
      className={`dc-project-card card-enter w-full text-left${jolting ? ' card-jolt' : ''}`}
      style={{ animationDelay: `${Math.min(index * 40, 300)}ms`, outline: 'none' }}
    >
      <div className="dc-project-card-inner">

        {/* Index */}
        <div className="dc-card-index">#{num}</div>

        {/* Left: name + topic + tags */}
        <div className="dc-project-info">
          <div className="dc-project-name">{project.slug.replace(/-/g, ' ')}</div>

          {project.topic && (
            <div className="dc-project-topic">{project.topic}</div>
          )}

          {project.tags.length > 0 && (
            <div className="dc-project-tags" style={{ marginTop: 4 }}>
              {project.tags.slice(0, 4).map(tag => (
                <span key={tag} className="dc-tag">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Right: status chip + session + time */}
        <div className="dc-project-meta">
          {/* Status chip — sharp rectangle */}
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: '0.08em',
            padding: '2px 7px',
            borderRadius: 2,
            border: `1px solid ${st.color}44`,
            background: `${st.color}14`,
            color: st.color,
            flexShrink: 0,
          }}>
            {st.label}
          </span>

          <div className="dc-project-session">
            <span
              className={project.sessionKey ? 'dc-session-dot dc-breathing' : 'dc-session-dot'}
              style={{ '--dot-color': project.sessionKey ? '#10b981' : '#1e3d5c' } as React.CSSProperties}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.05em' }}>
              {project.sessionKey ? 'CONN' : 'IDLE'}
            </span>
          </div>

          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
          }}>
            {project.updatedAt ? fmt(project.updatedAt) : '—'}
          </div>
        </div>
      </div>
    </button>
  );
}
