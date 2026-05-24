'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const SERVER_BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://127.0.0.1:18791';
const WS_URL      = SERVER_BASE.replace(/^http/, 'ws') + '/ws/gateway';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GatewayStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ContentBlock {
  type:     'text' | 'thinking' | 'toolCall' | 'toolResult';
  text?:    string;
  thinking?: string;
  id?:      string;
  name?:    string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arguments?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?:  any;
}

export interface ChatMessage {
  id:        string;
  role:      'user' | 'assistant';
  content:   ContentBlock[];
  timestamp: number;
  streaming?: boolean;
}

interface UseGatewayOptions {
  sessionId:  string | null;  // UUID (for display)
  sessionKey: string | null;  // full key for sessions.send
  onMessage?: (msg: ChatMessage) => void;
}

// ─── useGateway hook ──────────────────────────────────────────────────────────

export function useGateway({ sessionId, sessionKey, onMessage }: UseGatewayOptions) {
  const [status, setStatus]             = useState<GatewayStatus>('disconnected');
  const [streamingText, setStreamingText] = useState('');
  const wsRef       = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef  = useRef(true);
  const sessionRef  = useRef(sessionId);
  const sessionKeyRef = useRef(sessionKey);

  useEffect(() => { sessionRef.current = sessionId; }, [sessionId]);
  useEffect(() => { sessionKeyRef.current = sessionKey; }, [sessionKey]);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // wait for proxy 'connected' event from server before marking ready
    };

    ws.onmessage = (ev) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(ev.data);

        // Proxy lifecycle
        if (msg.type === 'proxy') {
          if (msg.event === 'connected') {
            setStatus('connected');
          } else if (msg.event === 'disconnected' || msg.event === 'error') {
            setStatus('error');
          }
          return;
        }

        // Gateway events
        if (msg.type === 'event') {
          handleGatewayEvent(msg);
        }
      } catch { /* ignore non-JSON */ }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setStatus('error');
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setStatus('disconnected');
      wsRef.current = null;
      // Auto-reconnect after 3s
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 3000);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Partial streaming message accumulator
  const streamRef = useRef<ChatMessage | null>(null);

  const handleGatewayEvent = useCallback((msg: {
    type: string; event: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload?: any;
  }) => {
    const { event, payload } = msg;

    // chat event: streaming delta or final message
    if (event === 'chat') {
      if (payload?.state === 'delta' && payload?.deltaText) {
        setStreamingText(prev => prev + payload.deltaText);
      } else if (payload?.state === 'final' && payload?.message) {
        const m = payload.message;
        const chatMsg: ChatMessage = {
          id:        `chat-${payload.sessionKey}-${payload.seq || Date.now()}`,
          role:      m.role,
          content:   normaliseContent(m.content),
          timestamp: m.timestamp || Date.now(),
        };
        streamRef.current = null;
        setStreamingText('');
        onMessage?.(chatMsg);
      }
      return;
    }

    // Legacy session.message event
    if (event === 'session.message' && payload?.message) {
      const m = payload.message;
      const chatMsg: ChatMessage = {
        id:        payload.id || String(Date.now()),
        role:      m.role,
        content:   normaliseContent(m.content),
        timestamp: m.timestamp || Date.now(),
      };
      streamRef.current = null;
      setStreamingText('');
      onMessage?.(chatMsg);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage]);

  useEffect(() => {
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;
    const key = sessionKeyRef.current || sessionRef.current;
    if (!key) return false;

    const reqId = `send-${Date.now()}`;
    wsRef.current.send(JSON.stringify({
      type:   'req',
      id:     reqId,
      method: 'sessions.send',
      params: { key, message: text, idempotencyKey: reqId },
    }));
    return true;
  }, []);

  return { status, streamingText, sendMessage };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseContent(raw: unknown): ContentBlock[] {
  if (!Array.isArray(raw)) {
    return [{ type: 'text', text: String(raw ?? '') }];
  }
  return raw.map((block: { type?: string; text?: string; thinking?: string; id?: string; name?: string; input?: unknown; content?: unknown }) => {
    switch (block.type) {
      case 'text':
        return { type: 'text' as const, text: block.text ?? '' };
      case 'thinking':
        return { type: 'thinking' as const, thinking: block.thinking ?? '' };
      case 'tool_use':
        return { type: 'toolCall' as const, id: block.id, name: block.name, arguments: block.input };
      case 'tool_result':
        return { type: 'toolResult' as const, id: block.id, result: block.content };
      default:
        return { type: 'text' as const, text: JSON.stringify(block) };
    }
  });
}
