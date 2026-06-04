'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';

const SERVER_BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://127.0.0.1:19000';
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
  sessionId:  string | null;
  sessionKey: string | null;
  onMessage?: (msg: ChatMessage) => void;
}

// ─── useGateway hook ──────────────────────────────────────────────────────────

export function useGateway({ sessionId, sessionKey, onMessage }: UseGatewayOptions) {
  const [status, setStatus]               = useState<GatewayStatus>('disconnected');
  const [streamingText, setStreamingText] = useState('');
  const [isGenerating, setIsGenerating]   = useState(false);
  const [agentActivity, setAgentActivity] = useState<string | null>(null);

  const wsRef            = useRef<WebSocket | null>(null);
  const reconnectRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef       = useRef(true);
  const sessionRef       = useRef(sessionId);
  const sessionKeyRef    = useRef(sessionKey);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventHandlerRef  = useRef<(msg: any) => void>(() => {});
  const connectRef       = useRef<() => void>(() => {});

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
      // wait for proxy 'connected' event from server
    };

    ws.onmessage = (ev) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(ev.data);

        if (msg.type === 'proxy') {
          if (msg.event === 'connected') setStatus('connected');
          else if (msg.event === 'disconnected' || msg.event === 'error') setStatus('error');
          return;
        }

        if (msg.type === 'event') eventHandlerRef.current(msg);
      } catch { /* ignore non-JSON */ }
    };

    ws.onerror = () => { if (mountedRef.current) setStatus('error'); };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setStatus('disconnected');
      setIsGenerating(false);
      setAgentActivity(null);
      wsRef.current = null;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(() => {
        if (mountedRef.current) connectRef.current();
      }, 3000);
    };
  }, []);

  const streamRef = useRef<ChatMessage | null>(null);

  const handleGatewayEvent = useCallback((msg: {
    type: string; event: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload?: any;
  }) => {
    const { event, payload } = msg;

    // Agent activity events — extract current tool/state label
    if (event === 'agent') {
      const state = payload?.state ?? payload?.status ?? '';
      const tool  = payload?.tool ?? payload?.name ?? payload?.toolName ?? null;
      if (state === 'idle' || state === 'done' || state === 'complete') {
        setAgentActivity(null);
      } else if (tool) {
        setAgentActivity(String(tool));
      } else if (state) {
        setAgentActivity(String(state));
      }
      return;
    }

    // session.operation — tool call in progress
    if (event === 'session.operation') {
      const op   = payload?.op ?? '';
      const name = payload?.name ?? payload?.tool ?? null;
      if (op === 'tool_call' || op === 'tool_start') {
        setAgentActivity(name ? String(name) : 'tool call');
      } else if (op === 'tool_end' || op === 'done') {
        setAgentActivity(null);
      }
      return;
    }

    if (event === 'chat') {
      if (payload?.state === 'delta' && payload?.deltaText) {
        setIsGenerating(true);
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
        setIsGenerating(false);
        setAgentActivity(null);
        onMessage?.(chatMsg);
      }
      return;
    }

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
      setIsGenerating(false);
      setAgentActivity(null);
      onMessage?.(chatMsg);
    }
  }, [onMessage]);

  // Keep refs up-to-date so closures defined before don't go stale
  useLayoutEffect(() => {
    eventHandlerRef.current = handleGatewayEvent;
    connectRef.current      = connect;
  });

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

    setIsGenerating(true);
    setAgentActivity(null);

    const reqId = `send-${Date.now()}`;
    wsRef.current.send(JSON.stringify({
      type:   'req',
      id:     reqId,
      method: 'sessions.send',
      params: { key, message: text, idempotencyKey: reqId },
    }));
    return true;
  }, []);

  const sendInterrupt = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;
    const key = sessionKeyRef.current || sessionRef.current;
    if (!key) return false;

    const reqId = `interrupt-${Date.now()}`;
    wsRef.current.send(JSON.stringify({
      type:   'req',
      id:     reqId,
      method: 'sessions.interrupt',
      params: { key },
    }));
    setIsGenerating(false);
    setAgentActivity(null);
    setStreamingText('');
    return true;
  }, []);

  return { status, streamingText, isGenerating, agentActivity, sendMessage, sendInterrupt };
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
      case 'toolCall':
        return { type: 'toolCall' as const, id: block.id, name: block.name, arguments: (block as {arguments?: unknown}).arguments ?? block.input };
      case 'tool_result':
      case 'toolResult':
        return { type: 'toolResult' as const, id: block.id, result: block.content ?? (block as {result?: unknown}).result };
      default:
        return { type: 'text' as const, text: JSON.stringify(block) };
    }
  });
}
