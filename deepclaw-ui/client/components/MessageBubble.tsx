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
    <div className="my-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs"
        style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontStyle: 'italic' }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="5" stroke="#64748b" strokeWidth="1"/>
          <path d="M4.5 5C4.5 4.17 5.17 3.5 6 3.5C6.83 3.5 7.5 4.17 7.5 5C7.5 5.6 7.14 6.1 6.6 6.35L6 6.6V7.5" stroke="#64748b" strokeWidth="1" strokeLinecap="round"/>
          <circle cx="6" cy="8.5" r="0.5" fill="#64748b"/>
        </svg>
        思考过程 {open ? '▲' : '▼'}
      </button>
      {open && (
        <div
          className="mt-1 pl-3 text-xs italic"
          style={{ color: '#64748b', borderLeft: '2px solid #cbd5e1', lineHeight: 1.6 }}
        >
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
          <div
            className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed text-white"
            style={{ background: 'linear-gradient(135deg, var(--dc-teal) 0%, var(--dc-teal-dark) 100%)' }}
          >
            {text}
          </div>
          <div className="text-right mt-1" style={{ fontSize: 11, color: '#94a3b8' }}>
            {fmtTime(message.timestamp)}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex gap-3 mb-4 msg-enter">
      {/* AI avatar */}
      <div
        className="shrink-0 rounded-full flex items-center justify-center"
        style={{ width: 32, height: 32, background: '#0f172a', border: '1.5px solid var(--dc-teal)', marginTop: 2 }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" fill="var(--dc-teal)" />
          <circle cx="8" cy="8" r="6" stroke="var(--dc-teal)" strokeWidth="1" fill="none" opacity="0.4"/>
        </svg>
      </div>

      <div style={{ maxWidth: '82%', flex: 1 }}>
        <div
          className="px-4 py-3 rounded-2xl rounded-tl-sm"
          style={{
            background: 'white',
            borderLeft: '2px solid var(--dc-teal)',
            boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
          }}
        >
          {message.content.map((block, i) => (
            <BlockRenderer key={i} block={block} />
          ))}
          {streaming && (
            <span className="typing-cursor" style={{ fontSize: 13, color: '#94a3b8' }} />
          )}
        </div>
        <div className="mt-1" style={{ fontSize: 11, color: '#94a3b8' }}>
          {fmtTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
