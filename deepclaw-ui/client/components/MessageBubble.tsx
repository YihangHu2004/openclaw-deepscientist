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
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--nb-orange)', letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        <span style={{
          width: 8, height: 8, display: 'inline-block',
          background: open ? 'var(--nb-orange)' : 'transparent',
          border: '1.5px solid var(--nb-orange)',
          transition: 'background 0.12s', flexShrink: 0,
        }} />
        THINKING {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{
          marginTop: 6, padding: '10px 12px',
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

// ─── Work block — groups all tool calls/results ───────────────────────────────
function WorkBlock({ blocks }: { blocks: ContentBlock[] }) {
  const [open, setOpen] = useState(false);

  const calls   = blocks.filter(b => b.type === 'toolCall');
  const names   = [...new Set(calls.map(b => b.name).filter(Boolean))] as string[];
  const count   = calls.length;

  return (
    <div style={{ margin: '6px 0' }}>
      {/* Collapsed header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--nb-lime)', letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        {/* Animated square LED */}
        <span style={{
          width: 8, height: 8, display: 'inline-block', flexShrink: 0,
          background: open ? 'var(--nb-lime)' : 'transparent',
          border: '1.5px solid var(--nb-lime)',
          transition: 'background 0.12s',
        }} />

        <span>
          WORK · {count} CALL{count !== 1 ? 'S' : ''}
          {names.length > 0 && (
            <span style={{ color: 'rgba(204,255,0,0.55)', marginLeft: 6 }}>
              {names.slice(0, 3).join(' · ')}
              {names.length > 3 ? ` +${names.length - 3}` : ''}
            </span>
          )}
        </span>

        <span style={{ opacity: 0.5, marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Expanded tool cards */}
      {open && (
        <div style={{ marginTop: 6 }}>
          {blocks.map((b, i) => <ToolCallCard key={i} block={b} />)}
        </div>
      )}
    </div>
  );
}

// ─── Content segmenter — groups consecutive tool blocks ───────────────────────
type Segment =
  | { kind: 'prose'; block: ContentBlock }
  | { kind: 'work';  blocks: ContentBlock[] };

function segmentContent(blocks: ContentBlock[]): Segment[] {
  const segments: Segment[] = [];
  let workBuf: ContentBlock[] = [];

  for (const block of blocks) {
    if (block.type === 'toolCall' || block.type === 'toolResult') {
      workBuf.push(block);
    } else {
      if (workBuf.length) { segments.push({ kind: 'work', blocks: workBuf }); workBuf = []; }
      segments.push({ kind: 'prose', block });
    }
  }
  if (workBuf.length) segments.push({ kind: 'work', blocks: workBuf });
  return segments;
}

// Detect renderable HTML blocks (div with style= attribute)
const HTML_PREVIEW_RE = /<div\s[^>]*style=/i;
function hasHtmlPreview(text: string) { return HTML_PREVIEW_RE.test(text); }

// ─── Prose block renderer ─────────────────────────────────────────────────────
function ProseBlock({ block, streaming, onHtmlPreview }: {
  block:           ContentBlock;
  streaming?:      boolean;
  onHtmlPreview?:  (html: string) => void;
}) {
  switch (block.type) {
    case 'text': {
      const text = block.text ?? '';
      const showPreviewBtn = onHtmlPreview && hasHtmlPreview(text);
      return (
        <div>
          <div className="dc-prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            {streaming && <span className="typing-cursor" style={{ fontSize: 13 }} />}
          </div>
          {showPreviewBtn && (
            <button
              onClick={() => onHtmlPreview!(text)}
              style={{
                marginTop: 8,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 10px',
                background: 'rgba(0,200,232,0.08)',
                border: '1px solid rgba(0,200,232,0.3)',
                color: 'var(--nb-cyan)',
                fontSize: 9, fontFamily: 'var(--font-mono)',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'background 150ms',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="1" y="1" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M3 5h4M5 3v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              在预览区渲染
            </button>
          )}
        </div>
      );
    }
    case 'thinking':
      return <ThinkingBlock text={block.thinking ?? ''} />;
    default:
      return null;
  }
}

// ─── Timestamp ────────────────────────────────────────────────────────────────
function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// Strip gateway sender-metadata prefix injected into user messages:
// "Sender (untrusted metadata): ```json\n{...}\n``` [timestamp] actual text"
const SENDER_META_RE = /^Sender\s+\([^)]+\):\s*```[a-z]*\s[\s\S]*?```\s*\[[^\]]*\]\s*/;
function stripSenderMeta(text: string): string {
  return text.replace(SENDER_META_RE, '').trimStart();
}

// ─── AI avatar — logo shape ───────────────────────────────────────────────────
function AiAvatar() {
  return (
    <div style={{
      flexShrink: 0, width: 26, height: 26, marginTop: 2,
      border: '1.5px solid rgba(0,200,232,0.5)',
      background: 'rgba(0,200,232,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 8px rgba(0,200,232,0.15)',
    }}>
      <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
        <defs>
          <linearGradient id="av-g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981"/>
            <stop offset="100%" stopColor="#00c8e8"/>
          </linearGradient>
        </defs>
        <path d="M6 22 L6 10 L16 4 L19 6.5 L9 12.5 L9 20.5 Z"     fill="url(#av-g)"/>
        <path d="M13 28 L23 22 L23 13 L20 11.5 L20 18.5 L12 23.5 Z" fill="url(#av-g)" opacity="0.85"/>
        <path d="M14 8 L26 15 L23 18 L14 12.5 Z"                    fill="url(#av-g)" opacity="0.4"/>
        <circle cx="16" cy="15" r="1.8" fill="#ffffff"/>
      </svg>
    </div>
  );
}

// ─── User avatar ──────────────────────────────────────────────────────────────
function UserAvatar() {
  return (
    <div style={{
      flexShrink: 0, width: 26, height: 26, marginTop: 2,
      border: '1.5px solid rgba(255,0,110,0.45)',
      background: 'rgba(255,0,110,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 8px rgba(255,0,110,0.12)',
    }}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5.5" r="2" stroke="var(--nb-pink)" strokeWidth="1.3"/>
        <path d="M3 13.5c0-2.2 2-3.5 5-3.5s5 1.3 5 3.5" stroke="var(--nb-pink)" strokeWidth="1.3" strokeLinecap="round"/>
        <ellipse cx="8" cy="5.5" rx="5" ry="1.5" stroke="var(--nb-pink)" strokeWidth="0.8" transform="rotate(25 8 5.5)" strokeDasharray="1.5 1" opacity="0.8"/>
        <ellipse cx="8" cy="5.5" rx="5" ry="1.5" stroke="var(--nb-pink)" strokeWidth="0.8" transform="rotate(-25 8 5.5)" opacity="0.8"/>
        <circle cx="13" cy="3" r="0.6" fill="var(--nb-pink)"/>
      </svg>
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

interface Props {
  message:        ChatMessage;
  streaming?:     boolean;
  compact?:       boolean;
  onHtmlPreview?: (html: string) => void;
}

export default function MessageBubble({ message, streaming, compact, onHtmlPreview }: Props) {
  const isUser = message.role === 'user';

  if (isUser) {
    const text = stripSenderMeta(message.content.filter(b => b.type === 'text').map(b => b.text).join(''));
    return (
      <div className="flex justify-end mb-4 msg-enter" style={{ gap: compact ? 0 : 8, alignItems: 'flex-start' }}>
        <div style={{ maxWidth: compact ? '90%' : '72%' }}>
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
        {!compact && <UserAvatar />}
      </div>
    );
  }

  // ── Assistant message ──────────────────────────────────────────────────────
  const segments = segmentContent(message.content);
  const lastIdx  = segments.length - 1;

  return (
    <div className="flex mb-5 msg-enter" style={{ gap: compact ? 0 : 10, alignItems: 'flex-start' }}>
      {!compact && <AiAvatar />}

      <div style={{ flex: 1, minWidth: 0, maxWidth: compact ? '100%' : 'calc(100% - 36px)' }}>
        <div style={{
          padding: '10px 14px',
          background: 'var(--bg-elevated)',
          border: '2px solid var(--border)',
          boxShadow: '3px 3px 0px #000',
        }}>
          {segments.map((seg, i) =>
            seg.kind === 'work'
              ? <WorkBlock key={i} blocks={seg.blocks} />
              : <ProseBlock key={i} block={seg.block} streaming={streaming && i === lastIdx} onHtmlPreview={onHtmlPreview} />
          )}
          {streaming && segments.length === 0 && (
            <span className="typing-cursor" style={{ fontSize: 13 }} />
          )}
        </div>
        <div style={{
          marginTop: 5,
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--text-muted)', letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          DEEPCLAW · {fmtTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
