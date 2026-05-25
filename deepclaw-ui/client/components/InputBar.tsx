'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { GatewayStatus } from '@/lib/gateway';

// ─── Status indicator ─────────────────────────────────────────────────────────
function StatusDot({ status }: { status: GatewayStatus }) {
  const colors: Record<GatewayStatus, string> = {
    connected:    '#22d3ee',
    connecting:   '#fcd34d',
    disconnected: '#475569',
    error:        '#f87171',
  };
  const labels: Record<GatewayStatus, string> = {
    connected:    '已连接',
    connecting:   '连接中…',
    disconnected: '未连接',
    error:        '连接失败',
  };
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={status === 'connected' ? 'pulse-dot' : ''}
        style={{ width: 7, height: 7, borderRadius: '50%', background: colors[status], display: 'inline-block' }}
      />
      <span style={{ fontSize: 11, color: '#64748b' }}>{labels[status]}</span>
    </div>
  );
}

// ─── Send icon ────────────────────────────────────────────────────────────────
function SendIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 9 L16 2 L10 9 L16 16 Z"
        fill={active ? 'var(--dc-teal)' : '#94a3b8'}
        style={{ transition: 'fill 0.15s' }}
      />
      <line x1="10" y1="9" x2="16" y2="9" stroke={active ? 'var(--dc-teal)' : '#94a3b8'} strokeWidth="1.5" strokeLinecap="round" style={{ transition: 'stroke 0.15s' }}/>
    </svg>
  );
}

// ─── InputBar ─────────────────────────────────────────────────────────────────

interface Props {
  status:      GatewayStatus;
  disabled?:   boolean;
  onSend:      (text: string) => void;
}

export default function InputBar({ status, disabled, onSend }: Props) {
  const [text, setText] = useState('');
  const textareaRef     = useRef<HTMLTextAreaElement>(null);

  const canSend = status === 'connected' && text.trim().length > 0 && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  return (
    <div
      className="px-4 py-3 border-t"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <StatusDot status={status} />
      <div
        className="flex items-end gap-2 mt-2 rounded-xl border px-3 py-2 transition-colors"
        style={{
          borderColor: text.length > 0 ? 'var(--accent)' : 'var(--border)',
          background: 'var(--bg-base)',
          boxShadow: text.length > 0 ? '0 0 0 2px rgba(0,200,232,0.08)' : 'none',
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={
            status === 'connected'
              ? '发消息给 AI agent… (Enter 发送，Shift+Enter 换行)'
              : status === 'connecting' ? '正在连接网关…'
              : '未连接到网关'
          }
          disabled={status !== 'connected' || disabled}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 14,
            lineHeight: 1.6,
            fontFamily: 'var(--font-ui)',
            color: 'var(--text-primary)',
            maxHeight: 160,
            overflowY: 'auto',
          }}
          className="dc-scroll"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{ background: 'none', border: 'none', cursor: canSend ? 'pointer' : 'not-allowed', padding: '2px', lineHeight: 0 }}
          title="发送 (Enter)"
        >
          <SendIcon active={canSend} />
        </button>
      </div>
      <div className="text-right mt-1" style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
        Shift+Enter 换行
      </div>
    </div>
  );
}
