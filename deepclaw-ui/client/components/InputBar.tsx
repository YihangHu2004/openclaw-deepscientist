'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { GatewayStatus } from '@/lib/gateway';

// ─── Status indicator (brutalist square) ─────────────────────────────────────
function StatusIndicator({ status }: { status: GatewayStatus }) {
  const colors: Record<GatewayStatus, string> = {
    connected:    'var(--cm-emerald)',
    connecting:   'var(--cm-amber)',
    disconnected: 'var(--text-muted)',
    error:        'var(--cm-rose)',
  };
  const labels: Record<GatewayStatus, string> = {
    connected:    'CONNECTED',
    connecting:   'CONNECTING…',
    disconnected: 'DISCONNECTED',
    error:        'ERROR',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        className={status === 'connected' ? 'pulse-dot' : ''}
        style={{
          width: 7, height: 7, borderRadius: 0,
          background: colors[status], display: 'inline-block',
          flexShrink: 0,
        }}
      />
      <span style={{
        fontSize: 9, fontFamily: 'var(--font-mono)',
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: colors[status],
      }}>{labels[status]}</span>
    </div>
  );
}

// ─── Send button arrow ────────────────────────────────────────────────────────
function SendArrow({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 8 L14 2 L9 8 L14 14 Z"
        fill={active ? 'var(--cm-emerald)' : 'var(--text-muted)'}
        style={{ transition: 'fill 200ms' }}
      />
    </svg>
  );
}

// ─── InputBar ─────────────────────────────────────────────────────────────────

interface Props {
  status:    GatewayStatus;
  disabled?: boolean;
  onSend:    (text: string) => void;
}

export default function InputBar({ status, disabled, onSend }: Props) {
  const [text, setText]       = useState('');
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = status === 'connected' && text.trim().length > 0 && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const placeholder =
    status === 'connected'    ? '发消息给 AI agent…  (Enter 发送，Shift+Enter 换行)' :
    status === 'connecting'   ? '正在连接网关…' :
    '未连接到网关';

  return (
    <div style={{
      padding: '10px 14px',
      background: 'var(--bg-surface)',
      borderTop: '1px solid rgba(255,255,255,0.07)',
      flexShrink: 0,
    }}>
      {/* Status row */}
      <div style={{ marginBottom: 7 }}>
        <StatusIndicator status={status} />
      </div>

      {/* Input row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 0,
        border: '1px solid',
        borderColor: focused && canSend ? 'rgba(52,211,153,0.4)'
                   : focused           ? 'rgba(255,255,255,0.14)'
                   : 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        boxShadow: focused && canSend ? '0 0 16px rgba(52,211,153,0.08)' : 'none',
        background: 'rgba(255,255,255,0.03)',
        overflow: 'hidden',
        transition: 'border-color 200ms, box-shadow 200ms',
      }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={status !== 'connected' || disabled}
          rows={1}
          style={{
            flex: 1, resize: 'none',
            background: 'transparent', border: 'none', outline: 'none',
            fontSize: 13, lineHeight: 1.6,
            fontFamily: 'var(--font-ui)',
            color: 'var(--text-primary)',
            maxHeight: 160, overflowY: 'auto',
            padding: '10px 12px',
          }}
          className="dc-scroll"
        />
        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            padding: '0 14px',
            alignSelf: 'stretch',
            border: 'none',
            borderLeft: '1px solid',
            borderLeftColor: canSend ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.06)',
            background: canSend ? 'rgba(52,211,153,0.1)' : 'transparent',
            cursor: canSend ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 200ms, border-color 200ms',
            flexShrink: 0, minWidth: 44,
          }}
          title="Send (Enter)"
        >
          <SendArrow active={canSend} />
        </button>
      </div>

      {/* Hint */}
      <div style={{
        textAlign: 'right', marginTop: 5,
        fontSize: 9, color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        Shift+Enter new line
      </div>
    </div>
  );
}
