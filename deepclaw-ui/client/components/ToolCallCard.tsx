'use client';

import { useState } from 'react';
import { ContentBlock } from '@/lib/gateway';

function prettyJson(v: unknown): string {
  try { return JSON.stringify(v, null, 2); }
  catch { return String(v); }
}

// ─── ToolCallCard (brutalist orange/lime) ────────────────────────────────────

export default function ToolCallCard({ block }: { block: ContentBlock }) {
  const [open, setOpen] = useState(false);
  const isResult = block.type === 'toolResult';

  const accentColor = isResult ? 'var(--nb-lime)' : 'var(--nb-orange)';
  const accentBg    = isResult ? 'rgba(204,255,0,0.04)' : 'rgba(255,149,0,0.04)';
  const accentDark  = isResult ? '#0a0a00' : '#0a0600';
  const label       = isResult
    ? `RESULT: ${String(block.id ?? '').slice(0, 8)}`
    : String(block.name ?? 'TOOL_CALL').toUpperCase();
  const bodyJson = isResult ? prettyJson(block.result) : prettyJson(block.arguments);

  return (
    <div
      className="my-2 overflow-hidden"
      style={{
        background: accentBg,
        border: `2px solid ${accentColor}`,
        boxShadow: `3px 3px 0px ${accentColor}`,
      }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 text-left"
        style={{
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          borderBottom: open ? `1px solid ${accentColor}33` : 'none',
          cursor: 'pointer',
        }}
      >
        {/* Square LED */}
        <span style={{
          width: 8, height: 8,
          background: accentColor,
          display: 'inline-block', flexShrink: 0,
        }} />

        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: accentColor,
        }}>
          {label}
        </span>

        <span style={{
          marginLeft: 'auto',
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: accentColor, opacity: 0.6,
        }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* Body */}
      {open && (
        <div
          className="dc-scroll"
          style={{
            maxHeight: 280, overflowY: 'auto',
            padding: '10px 12px',
            background: accentDark,
            fontFamily: 'var(--font-mono)',
            fontSize: 11, lineHeight: 1.55,
            color: accentColor,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}
        >
          {bodyJson}
        </div>
      )}
    </div>
  );
}
