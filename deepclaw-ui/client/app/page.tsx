'use client';

import { useState } from 'react';
import SessionList from '@/components/SessionList';
import ChatPanel from '@/components/ChatPanel';
import FileExplorer from '@/components/FileExplorer';
import { SessionMeta } from '@/lib/api';

function PanelToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={open ? '收起文件面板' : '展开文件面板'}
      style={{
        position: 'absolute',
        right: open ? 300 : 0,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 10,
        background: 'white',
        border: '1px solid var(--dc-border)',
        borderRight: 'none',
        borderRadius: '6px 0 0 6px',
        width: 20,
        height: 48,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        fontSize: 10,
        transition: 'right 0.2s ease',
      }}
    >
      {open ? '›' : '‹'}
    </button>
  );
}

export default function Page() {
  const [activeSession, setActiveSession] = useState<SessionMeta | null>(null);
  const [fileOpen, setFileOpen]           = useState(true);

  const handleSelect = (session: SessionMeta) => setActiveSession(session);

  return (
    <div className="flex h-full" style={{ fontFamily: 'var(--font-ui)' }}>
      <SessionList
        activeSessionId={activeSession?.id ?? null}
        onSelect={handleSelect}
      />

      <div className="flex-1 relative flex overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <ChatPanel
            sessionId={activeSession?.id ?? null}
            sessionKey={activeSession?.key ?? null}
          />
        </div>
        <PanelToggle open={fileOpen} onToggle={() => setFileOpen(o => !o)} />
        {fileOpen && <FileExplorer />}
      </div>
    </div>
  );
}
