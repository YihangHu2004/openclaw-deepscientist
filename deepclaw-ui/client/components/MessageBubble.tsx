'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, ContentBlock } from '@/lib/gateway';
import ToolCallCard from './ToolCallCard';

// ─── Thinking block ───────────────────────────────────────────────────────────
function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: '6px 0' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-muted)', letterSpacing: '0.06em',
        }}
      >
        {/* Small circuit-node icon */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <circle cx="5" cy="5" r="3" stroke="var(--text-muted)" strokeWidth="1"/>
          <circle cx="5" cy="5" r="1" fill="var(--text-muted)" opacity="0.6"/>
        </svg>
        THINKING {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{
          marginTop: 6,
          padding: '8px 12px',
          background: '#030b16',
          border: '1px solid var(--border-subtle)',
          borderRadius: 4,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          lineHeight: 1.65,
          fontStyle: 'italic',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

// ─── Render a single content block ───────────────────────────────────────────
function BlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'text':
      return (
        <div className="dc-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {block.text ?? ''}
          </ReactMarkdown>
        </div>
      );
    case 'thinking':
      return <ThinkingBlock text={block.thinking ?? ''} />;
    case 'toolCall':
    case 'toolResult':
      return <ToolCallCard block={block} />;
    default:
      return null;
  }
}

// ─── Timestamp ────────────────────────────────────────────────────────────────
function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// ─── Small AI indicator (replaces circular avatar) ────────────────────────────
function AiMark() {
  return (
    <div style={{
      flexShrink: 0,
      width: 22, height: 22,
      border: '1px solid rgba(0,200,232,0.3)',
      borderRadius: 3,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      marginTop: 2,
      background: 'rgba(0,200,232,0.06)',
    }}>
      {/* Simplified claw mark: 3 converging lines */}
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <line x1="2"  y1="2"  x2="5.5" y2="9" stroke="#00c8e8" strokeWidth="1.3" strokeLinecap="round"/>
        <line x1="5.5" y1="2" x2="5.5" y2="9" stroke="#00c8e8" strokeWidth="1.3" strokeLinecap="round"/>
        <line x1="9"  y1="2"  x2="5.5" y2="9" stroke="#00c8e8" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

interface Props {
  message:    ChatMessage;
  streaming?: boolean;
}

export default function MessageBubble({ message, streaming }: Props) {
  const isUser = message.role === 'user';

  if (isUser) {
    const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return (
      <div className="flex justify-end mb-3 msg-enter">
        <div style={{ maxWidth: '72%' }}>
          <div style={{
            padding: '9px 14px',
            borderRadius: 4,
            background: 'rgba(0,200,232,0.1)',
            border: '1px solid rgba(0,200,232,0.22)',
            fontSize: 13,
            lineHeight: 1.65,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui)',
            wordBreak: 'break-word',
          }}>
            {text}
          </div>
          <div style={{
            textAlign: 'right', marginTop: 4,
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: 'var(--text-muted)', letterSpacing: '0.05em',
          }}>
            {fmtTime(message.timestamp)}
          </div>
        </div>
      </div>
    );
  }

  // ── Assistant message ──────────────────────────────────────────────────────
  return (
    <div className="flex gap-2.5 mb-4 msg-enter" style={{ alignItems: 'flex-start' }}>
      <AiMark />

      <div style={{ flex: 1, minWidth: 0, maxWidth: 'calc(100% - 34px)' }}>
        <div style={{
          padding: '10px 14px',
          borderRadius: 4,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
        }}>
          {message.content.map((block, i) => (
            <BlockRenderer key={i} block={block} />
          ))}
          {streaming && (
            <span className="typing-cursor" style={{ fontSize: 13 }} />
          )}
        </div>
        <div style={{
          marginTop: 4,
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--text-muted)', letterSpacing: '0.05em',
        }}>
          {fmtTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
