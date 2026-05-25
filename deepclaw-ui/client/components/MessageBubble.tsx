'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, ContentBlock } from '@/lib/gateway';
import ToolCallCard from './ToolCallCard';

// ─── Thinking block (brutalist terminal) ─────────────────────────────────────
function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: '6px 0' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--nb-orange)', letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        {/* Square indicator */}
        <span style={{
          width: 8, height: 8, display: 'inline-block',
          background: open ? 'var(--nb-orange)' : 'transparent',
          border: '1.5px solid var(--nb-orange)',
          transition: 'background 0.12s',
          flexShrink: 0,
        }} />
        THINKING {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{
          marginTop: 6,
          padding: '10px 12px',
          background: '#0a0000',
          border: '2px solid var(--nb-orange)',
          boxShadow: '3px 3px 0px var(--nb-orange)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11, color: '#cc7700',
          lineHeight: 1.65, fontStyle: 'italic',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

// ─── Content block renderer ───────────────────────────────────────────────────
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

// ─── AI indicator mark ────────────────────────────────────────────────────────
function AiMark() {
  return (
    <div style={{
      flexShrink: 0,
      width: 22, height: 22,
      border: '2px solid var(--nb-cyan)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      marginTop: 2,
      background: 'rgba(0, 217, 255, 0.06)',
      boxShadow: '2px 2px 0px var(--nb-cyan)',
    }}>
      {/* 3-line claw mark */}
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <line x1="2"   y1="2"  x2="5.5" y2="9" stroke="var(--nb-cyan)" strokeWidth="1.4" strokeLinecap="square"/>
        <line x1="5.5" y1="2"  x2="5.5" y2="9" stroke="var(--nb-cyan)" strokeWidth="1.4" strokeLinecap="square"/>
        <line x1="9"   y1="2"  x2="5.5" y2="9" stroke="var(--nb-cyan)" strokeWidth="1.4" strokeLinecap="square"/>
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
      <div className="flex justify-end mb-4 msg-enter">
        <div style={{ maxWidth: '72%' }}>
          <div style={{
            padding: '10px 14px',
            background: 'rgba(255, 0, 110, 0.06)',
            border: '2px solid var(--nb-pink)',
            boxShadow: '3px 3px 0px var(--nb-pink)',
            fontSize: 13, lineHeight: 1.65,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui)',
            wordBreak: 'break-word',
          }}>
            {text}
          </div>
          <div style={{
            textAlign: 'right', marginTop: 5,
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: 'var(--text-muted)', letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            YOU · {fmtTime(message.timestamp)}
          </div>
        </div>
      </div>
    );
  }

  // ── Assistant message ──────────────────────────────────────────────────────
  return (
    <div className="flex gap-2.5 mb-5 msg-enter" style={{ alignItems: 'flex-start' }}>
      <AiMark />

      <div style={{ flex: 1, minWidth: 0, maxWidth: 'calc(100% - 34px)' }}>
        <div style={{
          padding: '10px 14px',
          background: 'var(--bg-elevated)',
          border: '2px solid var(--border)',
          boxShadow: '3px 3px 0px #000',
        }}>
          {message.content.map((block, i) => (
            <BlockRenderer key={i} block={block} />
          ))}
          {streaming && (
            <span className="typing-cursor" style={{ fontSize: 13 }} />
          )}
        </div>
        <div style={{
          marginTop: 5,
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--text-muted)', letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          AI · {fmtTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
