'use client';

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createProject, createSession, bindProjectSession } from '@/lib/api';

interface Props {
  open:    boolean;
  onClose: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{
        display: 'block', marginBottom: 8,
        fontSize: 10, fontFamily: 'var(--font-mono)',
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}>
        {label}
        {optional && <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 9 }}>(optional)</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  outline: 'none',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 14,
  transition: 'border-color 200ms, box-shadow 200ms',
};

export default function LaunchDialog({ open, onClose }: Props) {
  const router = useRouter();
  const [title, setTitle]         = useState('');
  const [direction, setDirection] = useState('');
  const [creating, setCreating]   = useState(false);
  const [error, setError]         = useState('');
  const titleRef                  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle(''); setDirection(''); setError(''); setCreating(false);
      setTimeout(() => titleRef.current?.focus(), 80);
    }
  }, [open]);

  const slug = slugify(title);

  const handleCreate = useCallback(async () => {
    if (!slug) { setError('Project name is required'); return; }
    setCreating(true); setError('');
    try {
      await createProject(slug);
      // Create a session and bind it immediately so the project page
      // can connect to the gateway and send the init message right away.
      const { sessionKey } = await createSession();
      await bindProjectSession(slug, sessionKey);
      const qs = direction.trim() ? `?init=${encodeURIComponent(direction.trim())}` : '';
      onClose();
      router.push(`/project/${encodeURIComponent(slug)}${qs}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
      setCreating(false);
    }
  }, [slug, direction, onClose, router]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  const focusStyle = (el: HTMLElement) => {
    el.style.borderColor = 'rgba(52,211,153,0.4)';
    el.style.boxShadow   = '0 0 18px rgba(52,211,153,0.08)';
  };
  const blurStyle = (el: HTMLElement) => {
    el.style.borderColor = 'rgba(255,255,255,0.1)';
    el.style.boxShadow   = 'none';
  };

  if (!open) return null;

  return (
    <div
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(14px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="card-enter"
        style={{
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          padding: '36px 40px',
          width: '100%', maxWidth: 520,
          boxShadow: '0 40px 120px rgba(0,0,0,0.85), 0 0 80px rgba(52,211,153,0.05)',
          position: 'relative',
        }}
      >
        {/* Top accent line */}
        <div style={{
          position: 'absolute', top: 0, left: 40, right: 40, height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(52,211,153,0.4), transparent)',
          borderRadius: '0 0 2px 2px',
        }} />

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 18, lineHeight: 1,
            padding: '4px 8px', borderRadius: 6,
            transition: 'color 150ms, background 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontFamily: 'var(--font-brand)',
            fontSize: 20, fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            Launch Research
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', lineHeight: 1.5 }}>
            Start a new autonomous research project
          </div>
        </div>

        <Field label="Project Name">
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreate(); } }}
            placeholder="e.g. Neural Scaling Laws"
            style={INPUT_STYLE}
            onFocus={e => focusStyle(e.currentTarget)}
            onBlur={e => blurStyle(e.currentTarget)}
          />
          {slug && slug !== title.trim().toLowerCase().replace(/\s+/g, '-') && (
            <div style={{ marginTop: 5, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              id: {slug}
            </div>
          )}
        </Field>

        <Field label="Research Direction" optional>
          <textarea
            value={direction}
            onChange={e => setDirection(e.target.value)}
            placeholder="Describe your research objective, hypothesis, or key question…"
            rows={4}
            style={{
              ...INPUT_STYLE,
              resize: 'none',
              lineHeight: 1.6,
              fontSize: 13,
            } as React.CSSProperties}
            onFocus={e => focusStyle(e.currentTarget)}
            onBlur={e => blurStyle(e.currentTarget)}
          />
        </Field>

        {error && (
          <div style={{
            marginBottom: 20, padding: '9px 14px',
            background: 'rgba(251,113,133,0.08)',
            border: '1px solid rgba(251,113,133,0.25)',
            borderRadius: 8,
            fontSize: 12, color: '#fb7185', fontFamily: 'var(--font-mono)',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={creating}
            style={{
              padding: '10px 20px', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-ui)', fontSize: 13,
              cursor: creating ? 'not-allowed' : 'pointer',
              transition: 'all 150ms',
            }}
            onMouseEnter={e => { if (!creating) { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; } }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !slug}
            style={{
              padding: '10px 28px', borderRadius: 10,
              border: `1px solid ${creating || !slug ? 'rgba(255,255,255,0.08)' : 'rgba(52,211,153,0.4)'}`,
              background: creating || !slug ? 'rgba(255,255,255,0.04)' : 'rgba(52,211,153,0.1)',
              color: creating || !slug ? 'var(--text-muted)' : 'var(--cm-emerald)',
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
              cursor: creating || !slug ? 'not-allowed' : 'pointer',
              transition: 'all 200ms',
              boxShadow: !creating && slug ? '0 0 24px rgba(52,211,153,0.12)' : 'none',
            }}
          >
            {creating ? 'Creating…' : 'Launch →'}
          </button>
        </div>
      </div>
    </div>
  );
}
