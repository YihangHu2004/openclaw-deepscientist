'use client';

import { useState } from 'react';
import { ContentBlock } from '@/lib/gateway';

// ─── Hexagonal gear icon ──────────────────────────────────────────────────────
function GearHexIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      {/* Hexagon outline */}
      <path d="M7 1 L11.3 3.5 L11.3 8.5 L7 11 L2.7 8.5 L2.7 3.5 Z"
        stroke="#22d3ee" strokeWidth="1" fill="none" strokeLinejoin="round"/>
      {/* Center dot */}
      <circle cx="7" cy="6" r="1.5" fill="#22d3ee" />
      {/* Gear teeth stubs */}
      <line x1="7" y1="1" x2="7" y2="2.2" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="9.8" x2="7" y2="11" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Pretty-print JSON ────────────────────────────────────────────────────────
function prettyJson(v: unknown): string {
  try { return JSON.stringify(v, null, 2); }
  catch { return String(v); }
}

// ─── ToolCallCard ─────────────────────────────────────────────────────────────

export default function ToolCallCard({ block }: { block: ContentBlock }) {
  const [open, setOpen] = useState(false);
  const isResult = block.type === 'toolResult';

  const label    = isResult ? `结果: ${block.id ?? ''}` : (block.name ?? 'tool_call');
  const bodyJson = isResult ? prettyJson(block.result) : prettyJson(block.arguments);

  return (
    <div
      className="my-1 rounded-lg overflow-hidden"
      style={{ background: 'var(--dc-tool-bg)', border: '1px solid #334155' }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12 }}
      >
        <GearHexIcon />
        <span style={{ fontFamily: 'var(--font-mono)', color: isResult ? '#86efac' : '#22d3ee', fontWeight: 500 }}>
          {label}
        </span>
        <span className="ml-auto" style={{ color: '#475569', fontSize: 11 }}>
          {open ? '▲ 收起' : '▼ 展开'}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 tool-code dc-scroll-dark">
          {bodyJson}
        </div>
      )}
    </div>
  );
}
