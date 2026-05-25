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

// ─── No-session state ─────────────────────────────────────────────────────────
function NoSessionState({ onCreateSession, creating }: { onCreateSession?: () => void; creating: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: '#94a3b8' }}>
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <circle cx="22" cy="22" r="9"  fill="none" stroke="var(--border)"        strokeWidth="1.5"/>
        <circle cx="22" cy="22" r="16" fill="none" stroke="var(--border-subtle)" strokeWidth="1"/>
        <circle cx="22" cy="22" r="3.5" fill="var(--border)"/>
      </svg>
      {onCreateSession ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            此项目尚未绑定 Session
          </div>
          <button
            onClick={onCreateSession}
            disabled={creating}
            className="dc-btn dc-btn-primary"
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            {creating ? '创建中…' : '新建 Session 开始对话'}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
          选择左侧会话开始对话
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
  onSessionCreated?: (sessionId: string, sessionKey: string) => void;
}

export default function ChatPanel({ sessionId, sessionKey, slug, initialMessage, onSessionCreated }: Props) {
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

  const { status, streamingText, sendMessage } = useGateway({
    sessionId,
    sessionKey,
    onMessage: handleNewMessage,
  });

  // Auto-send initialMessage once connected (for new sessions from landing page)
  useEffect(() => {
    if (!initialMessage || initialSentRef.current || status !== 'connected') return;
    initialSentRef.current = true;
    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`, role: 'user',
      content: [{ type: 'text', text: initialMessage }], timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    sendMessage(initialMessage);
  }, [status, initialMessage, sendMessage]);

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
      const userMsg: ChatMessage = {
        id:        `local-${Date.now()}`,
        role:      'user',
        content:   [{ type: 'text', text }],
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);
      sendMessage(text);
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
          <div className="flex items-center justify-center h-full gap-2" style={{ color: '#94a3b8', fontSize: 14 }}>
            <span className="pulse-dot inline-block w-2 h-2 rounded-full" style={{ background: 'var(--dc-teal)' }} />
            加载历史消息…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>暂无消息记录</div>
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
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {/* Streaming placeholder */}
            {streamingText && (
              <div className="flex gap-2.5 mb-4 msg-enter" style={{ alignItems: 'flex-start' }}>
                {/* AiMark — matches MessageBubble */}
                <div style={{
                  flexShrink: 0, width: 22, height: 22, marginTop: 2,
                  border: '1px solid rgba(0,200,232,0.3)', borderRadius: 3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,200,232,0.06)',
                }}>
                  <span className="pulse-dot inline-block" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />
                </div>
                <div className="dc-prose"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '10px 14px', flex: 1, minWidth: 0 }}>
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
