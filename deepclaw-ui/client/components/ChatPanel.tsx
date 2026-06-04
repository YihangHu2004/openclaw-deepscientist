'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGateway, ChatMessage } from '@/lib/gateway';
import { fetchSessionHistory, fetchProjectFiles, createSession, bindProjectSession, HistoryMessage } from '@/lib/api';
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
          case 'tool_use':    return { type: 'toolCall'  as const, id: b.id, name: b.name,  arguments: b.input ?? (b as {arguments?: unknown}).arguments };
          case 'toolCall':    return { type: 'toolCall'  as const, id: b.id, name: b.name,  arguments: (b as {arguments?: unknown}).arguments ?? b.input };
          case 'tool_result': return { type: 'toolResult' as const, id: b.id, result: b.content ?? (b as {result?: unknown}).result };
          case 'toolResult':  return { type: 'toolResult' as const, id: b.id, result: (b as {result?: unknown}).result ?? b.content };
          default:            return { type: 'text' as const, text: JSON.stringify(b) };
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

// ─── No-session state ─────────────────────────────────────────────────────────
function NoSessionState({ onCreateSession, creating }: { onCreateSession?: () => void; creating: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5" style={{ color: 'var(--text-muted)' }}>
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="10"  fill="none" stroke="rgba(52,211,153,0.2)" strokeWidth="1.5"/>
        <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(52,211,153,0.08)" strokeWidth="1"/>
        <circle cx="24" cy="24" r="4"  fill="rgba(52,211,153,0.15)"/>
      </svg>
      {onCreateSession ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, fontFamily: 'var(--font-ui)' }}>
            No session linked to this project
          </div>
          <button
            onClick={onCreateSession}
            disabled={creating}
            className="dc-btn dc-btn-primary"
            style={{ fontSize: 12, padding: '7px 18px' }}
          >
            {creating ? 'Creating…' : 'New Session'}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Select a session
        </div>
      )}
    </div>
  );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

interface Props {
  sessionId:        string | null;
  sessionKey:       string | null;
  slug?:            string;
  initialMessage?:  string;
  compact?:         boolean;
  onSessionCreated?: (sessionId: string, sessionKey: string) => void;
  onHtmlPreview?:   (html: string) => void;
}

export default function ChatPanel({ sessionId, sessionKey, slug, initialMessage, compact, onSessionCreated, onHtmlPreview }: Props) {
  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [initSending, setInitSending] = useState(false);
  const [creating, setCreating]       = useState(false);
  const initialSentRef                = useRef(false);
  const bottomRef                     = useRef<HTMLDivElement>(null);

  const handleNewMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const { status, streamingText, isGenerating, agentActivity, sendMessage, sendInterrupt } = useGateway({
    sessionId,
    sessionKey,
    onMessage: handleNewMessage,
  });

  // Auto-send initialMessage once connected AND sessionKey is available.
  // Only mark as sent if sendMessage() actually succeeds (returns true),
  // so the effect retries on the next status/sessionKey change if the key
  // wasn't ready yet when the WebSocket first connected.
   
  useEffect(() => {
    if (!initialMessage || initialSentRef.current || status !== 'connected' || !sessionKey) return;
    const ok = sendMessage(initialMessage);
    if (!ok) return;
    initialSentRef.current = true;
    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`, role: 'user',
      content: [{ type: 'text', text: initialMessage }], timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
  }, [status, sessionKey, initialMessage, sendMessage]);

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

  const handleInitWorkspace = useCallback(async () => {
    if (!slug || !sessionId || status !== 'connected') return;
    setInitSending(true);
    try {
      const files = await fetchProjectFiles(slug, '');
      const fileList = files
        .sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1))
        .map(f => `  ${f.isDirectory ? '📁' : '📄'} ${f.name}`)
        .join('\n');
      const text = `请读取并了解 **${slug}** 项目工作区，汇报当前研究进展。\n\n工作区文件：\n${fileList || '（空目录）'}\n\n请逐一读取关键文件（project.md、plan.md、brief.md、README.md 等 .md 类型文件），然后告诉我：研究背景、当前阶段和最新状态。`;
      const ok = sendMessage(text);
      if (!ok) return;
      setMessages(prev => [...prev, {
        id:        `local-${Date.now()}`,
        role:      'user',
        content:   [{ type: 'text', text }],
        timestamp: Date.now(),
      } as ChatMessage]);
    } catch (e) {
      console.error('Init workspace failed', e);
    } finally {
      setInitSending(false);
    }
  }, [slug, sessionId, status, sendMessage]);

  const handleCreateSession = useCallback(async () => {
    if (!slug || !onSessionCreated || creating) return;
    setCreating(true);
    try {
      const { sessionId: newId, sessionKey: newKey } = await createSession();
      await bindProjectSession(slug, newKey);
      onSessionCreated(newId, newKey);
    } catch (e) {
      console.error('Create session failed:', e);
    } finally {
      setCreating(false);
    }
  }, [slug, onSessionCreated, creating]);

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
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-base)' }}>
      {/* Message area */}
      <div className="flex-1 overflow-y-auto dc-scroll px-5 py-4">
        {!sessionId ? (
          <NoSessionState
            onCreateSession={slug ? handleCreateSession : undefined}
            creating={creating}
          />
        ) : histLoading ? (
          <div className="flex items-center justify-center h-full gap-2.5" style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            <span className="pulse-dot inline-block" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cm-emerald)', display: 'inline-block' }} />
            Loading…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>No messages yet</div>
            {slug && (
              <button
                onClick={handleInitWorkspace}
                disabled={initSending || status !== 'connected'}
                className="dc-btn dc-btn-primary"
                style={{ fontSize: 12, gap: 6 }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                  <path d="M2 2h4l1.5 2H11v7H2V2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" fill="none"/>
                </svg>
                {initSending ? '读取中…' : '读取工作区，了解研究进展'}
              </button>
            )}
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} compact={compact} onHtmlPreview={onHtmlPreview} />
            ))}
            {/* Streaming placeholder */}
            {(streamingText || isGenerating) && (
              <div className="flex mb-5 msg-enter" style={{ alignItems: 'flex-start', gap: compact ? 0 : 10 }}>
                {!compact && (
                  <div style={{
                    flexShrink: 0, width: 34, height: 34, marginTop: 0,
                    position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {/* Outer spinning ring */}
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: '50%',
                      border: '1px solid rgba(0,200,232,0.5)',
                      animation: 'dc-work-spin 2s linear infinite',
                    }} />
                    {/* Inner counter-spin dashed ring */}
                    <div style={{
                      position: 'absolute', inset: 5, borderRadius: '50%',
                      border: '1px dashed rgba(16,185,129,0.6)',
                      animation: 'dc-work-spin-rev 3.5s linear infinite',
                    }} />
                    {/* Logo center */}
                    <svg width="13" height="13" viewBox="0 0 32 32" fill="none" style={{ position: 'relative', zIndex: 1 }}>
                      <defs>
                        <linearGradient id="wk-g" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#10b981"/>
                          <stop offset="100%" stopColor="#00c8e8"/>
                        </linearGradient>
                      </defs>
                      <path d="M6 22 L6 10 L16 4 L19 6.5 L9 12.5 L9 20.5 Z"     fill="url(#wk-g)"/>
                      <path d="M13 28 L23 22 L23 13 L20 11.5 L20 18.5 L12 23.5 Z" fill="url(#wk-g)" opacity="0.85"/>
                      <path d="M14 8 L26 15 L23 18 L14 12.5 Z"                    fill="url(#wk-g)" opacity="0.4"/>
                      <circle cx="16" cy="15" r="1.8" fill="#fff"/>
                    </svg>
                    <style>{`
                      @keyframes dc-work-spin     { to { transform: rotate(360deg); } }
                      @keyframes dc-work-spin-rev { to { transform: rotate(-360deg); } }
                    `}</style>
                  </div>
                )}
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: '10px 14px', flex: 1, minWidth: 0,
                }}>
                  {/* Tool activity label when no text yet */}
                  {!streamingText && agentActivity && (
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9,
                      color: 'var(--nb-lime)', letterSpacing: '0.1em',
                      textTransform: 'uppercase', marginBottom: 4,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span className="pulse-dot inline-block"
                            style={{ width: 5, height: 5, borderRadius: 0, background: 'var(--nb-lime)', display: 'inline-block' }} />
                      {agentActivity}
                    </div>
                  )}
                  {streamingText && (
                    <div className="dc-prose">
                      {streamingText}
                    </div>
                  )}
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
        isGenerating={isGenerating}
        agentActivity={agentActivity}
        onSend={handleSend}
        onInterrupt={sendInterrupt}
      />
    </div>
  );
}
