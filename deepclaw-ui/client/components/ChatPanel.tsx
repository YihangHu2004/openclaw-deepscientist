'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGateway, ChatMessage } from '@/lib/gateway';
import { fetchSessionHistory, HistoryMessage } from '@/lib/api';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';

// ─── Convert API history format to ChatMessage ────────────────────────────────
function historyToChat(hm: HistoryMessage): ChatMessage {
  // Inline normaliseContent (same logic as gateway.ts)
  const raw = hm.content as Array<{ type?: string; text?: string; thinking?: string; id?: string; name?: string; input?: unknown; content?: unknown }>;
  const content = Array.isArray(raw)
    ? raw.map(b => {
        switch (b.type) {
          case 'text':       return { type: 'text' as const, text: b.text ?? '' };
          case 'thinking':   return { type: 'thinking' as const, thinking: b.thinking ?? '' };
          case 'tool_use':   return { type: 'toolCall' as const, id: b.id, name: b.name, arguments: b.input };
          case 'tool_result':return { type: 'toolResult' as const, id: b.id, result: b.content };
          default:           return { type: 'text' as const, text: JSON.stringify(b) };
        }
      })
    : [{ type: 'text' as const, text: String(raw ?? '') }];

  return {
    id:        hm.id,
    role:      hm.role,
    content,
    timestamp: hm.timestamp,
  };
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: '#94a3b8' }}>
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="10" fill="none" stroke="#cbd5e1" strokeWidth="2"/>
        <circle cx="24" cy="24" r="18" fill="none" stroke="#e2e8f0" strokeWidth="1.5"/>
        <circle cx="24" cy="24" r="26" fill="none" stroke="#f1f5f9" strokeWidth="1"/>
        <circle cx="24" cy="24" r="4" fill="#cbd5e1"/>
      </svg>
      <div style={{ fontSize: 14, textAlign: 'center' }}>
        <div style={{ fontWeight: 500 }}>选择左侧会话开始对话</div>
        <div style={{ fontSize: 12, marginTop: 4, color: '#cbd5e1' }}>或等待 AI agent 发来消息</div>
      </div>
    </div>
  );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

interface Props { sessionId: string | null; sessionKey: string | null; }

export default function ChatPanel({ sessionId, sessionKey }: Props) {
  const [messages, setMessages]     = useState<ChatMessage[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleNewMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const { status, streamingText, sendMessage } = useGateway({
    sessionId,
    sessionKey,
    onMessage: handleNewMessage,
  });

  // Load history when session changes
  useEffect(() => {
    if (!sessionId) { setMessages([]); return; }
    setMessages([]);
    setHistLoading(true);
    fetchSessionHistory(sessionId)
      .then(data => setMessages(data.messages.map(historyToChat)))
      .catch(e => console.error('History load failed', e))
      .finally(() => setHistLoading(false));
  }, [sessionId]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleSend = (text: string) => {
    // Optimistically add user message
    const userMsg: ChatMessage = {
      id:        `local-${Date.now()}`,
      role:      'user',
      content:   [{ type: 'text', text }],
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    sendMessage(text);
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--dc-chat)' }}>
      {/* Message area */}
      <div className="flex-1 overflow-y-auto dc-scroll px-6 py-4">
        {!sessionId ? (
          <EmptyState />
        ) : histLoading ? (
          <div className="flex items-center justify-center h-full gap-2" style={{ color: '#94a3b8', fontSize: 14 }}>
            <span className="pulse-dot inline-block w-2 h-2 rounded-full" style={{ background: 'var(--dc-teal)' }} />
            加载历史消息…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ color: '#94a3b8', fontSize: 14 }}>
            暂无消息记录
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {/* Streaming placeholder */}
            {streamingText && (
              <div className="flex gap-3 mb-4 msg-enter">
                <div className="shrink-0 rounded-full flex items-center justify-center"
                  style={{ width: 32, height: 32, background: '#0f172a', border: '1.5px solid var(--dc-teal)', marginTop: 2 }}>
                  <span className="pulse-dot inline-block w-2 h-2 rounded-full" style={{ background: 'var(--dc-teal)' }} />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm dc-prose"
                  style={{ background: 'white', borderLeft: '2px solid var(--dc-teal)', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', maxWidth: '82%' }}>
                  {streamingText}
                  <span className="typing-cursor" />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <InputBar
        status={status}
        disabled={!sessionId}
        onSend={handleSend}
      />
    </div>
  );
}
