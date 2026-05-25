'use client';

import { useState } from 'react';
import { ContentBlock } from '@/lib/gateway';

function prettyJson(v: unknown): string {
  try { return JSON.stringify(v, null, 2); }
  catch { return String(v); }
}

// ─── Rectangular LED indicator (DS-style) ─────────────────────────────────────
function Indicator({ isResult }: { isResult: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 5, height: 12, borderRadius: 1,
      flexShrink: 0,
      background: isResult ? '#10b981' : '#00c8e8',
      boxShadow: isResult
        ? '0 0 6px #10b981'
        : '0 0 6px #00c8e8',
    }} />
  );
}

// ─── ToolCallCard ─────────────────────────────────────────────────────────────

export default function ToolCallCard({ block }: { block: ContentBlock }) {
  const [open, setOpen] = useState(false);
  const isResult = block.type === 'toolResult';
  const label    = isResult ? `RESULT: ${String(block.id ?? '').slice(0, 8)}` : String(block.name ?? 'tool_call').toUpperCase();
  const bodyJson = isResult ? prettyJson(block.result) : prettyJson(block.arguments);

  return (
    <div
      className="my-1.5 overflow-hidden"
      style={{
        background: '#020617',
        border: '1px solid',
        borderColor: isResult ? 'rgba(16,185,129,0.22)' : 'rgba(0,200,232,0.18)',
        borderRadius: 6,
        boxShadow: isResult
          ? '0 0 14px rgba(16,185,129,0.08)'
          : '0 0 14px rgba(0,200,232,0.07)',
        transition: 'border-color var(--dur-normal) var(--ease-snappy), box-shadow var(--dur-normal) var(--ease-snappy)',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 text-left"
        style={{
          padding: '8px 12px',
          background: isResult ? 'rgba(16,185,129,0.06)' : 'rgba(0,200,232,0.05)',
          border: 'none', cursor: 'pointer',
          borderBottom: open ? '1px solid rgba(255,255,255,0.04)' : 'none',
          transition: 'background var(--dur-fast) var(--ease-snappy)',
        }}
      >
        <Indicator isResult={isResult} />

        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          fontWeight: 600, letterSpacing: '0.06em',
          color: isResult ? '#34d399' : '#22d3ee',
          textShadow: isResult
            ? '0 0 7px rgba(52,211,153,0.35)'
            : '0 0 7px rgba(34,211,238,0.35)',
        }}>
          {label}
        </span>

        <span className="ml-auto" style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: isResult ? 'rgba(52,211,153,0.5)' : 'rgba(34,211,238,0.4)',
          letterSpacing: '0.04em',
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
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            lineHeight: 1.55,
            color: isResult ? '#34d399' : '#22d3ee',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {bodyJson}
        </div>
      )}
    </div>
  );
}
