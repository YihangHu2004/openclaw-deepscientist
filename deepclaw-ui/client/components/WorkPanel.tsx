'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchProjectFiles, fetchProjectFileText, projectFileUrl, FileItem } from '@/lib/api';

// ─── Icons ────────────────────────────────────────────────────────────────────

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="13" viewBox="0 0 14 13" fill="none" style={{ flexShrink: 0 }}>
      <path d={open
        ? 'M1 4h12v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z M1 4V3a1 1 0 011-1h2.5l1.5 2H1z'
        : 'M1 3h12v8a1 1 0 01-1 1H2a1 1 0 01-1-1V3z M1 3V2a1 1 0 011-1h2.5l1.5 2H1z'}
        stroke="rgba(255,255,255,0.4)" strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="12" height="15" viewBox="0 0 12 15" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2 1h6l3 3v9a1 1 0 01-1 1H2a1 1 0 01-1-1V2a1 1 0 011-1z M8 1v4h3"
            stroke="rgba(255,255,255,0.35)" strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

interface TrajectoryRecord {
  timestamp?: string;
  phase?: string;
  step?: number | string;
  thought?: string;
  action?: {
    tool_name?: string;
    parameters?: Record<string, unknown>;
  };
  observation?: string;
  reflection?: string;
}

function TrajectoryTimeline({ content }: { content: string }) {
  const { records, malformed } = useMemo(() => {
    const parsed: TrajectoryRecord[] = [];
    let bad = 0;
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const value = JSON.parse(trimmed);
        if (value && typeof value === 'object') parsed.push(value as TrajectoryRecord);
        else bad += 1;
      } catch {
        bad += 1;
      }
    }
    return { records: parsed, malformed: bad };
  }, [content]);

  const visible = records.slice(-80).reverse();

  const labelFor = (phase?: string) => {
    if (phase === 'Memory_Retrieve') return { label: 'memory read', color: '#38bdf8' };
    if (phase === 'Memory_Store') return { label: 'memory write', color: '#34d399' };
    return { label: 'stage action', color: '#f59e0b' };
  };

  const summarize = (record: TrajectoryRecord) => {
    const params = record.action?.parameters ?? {};
    if (record.phase === 'Memory_Retrieve') {
      return `read=${JSON.stringify(params.files_read ?? [])}; returned=${String(params.records_returned ?? 0)}; requester=${String(params.requester_phase ?? '')}`;
    }
    if (record.phase === 'Memory_Store') {
      return `stored=${String(params.stored_phase ?? '')} step=${String(params.stored_step ?? '')}; action=${String(params.stored_action ?? '')}`;
    }
    return record.observation || '';
  };

  if (records.length === 0) {
    return (
      <div className="p-5" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        No trajectory records found.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto dc-scroll p-4" style={{ background: 'var(--bg-base)' }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>Trajectory Timeline</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Showing latest {visible.length} of {records.length} JSONL records{malformed ? `; skipped ${malformed} malformed lines` : ''}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {visible.map((record, idx) => {
          const meta = labelFor(record.phase);
          return (
            <div key={`${record.timestamp}-${record.phase}-${record.step}-${idx}`}
                 style={{
                   border: '1px solid var(--border-subtle)',
                   borderRadius: 8,
                   background: 'var(--bg-surface)',
                   padding: '10px 11px',
                 }}>
              <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                <span style={{
                  fontSize: 10,
                  color: meta.color,
                  border: `1px solid ${meta.color}55`,
                  borderRadius: 999,
                  padding: '1px 7px',
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                }}>{meta.label}</span>
                <span className="truncate" style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
                  {record.phase || 'Unknown'} step={String(record.step ?? '')}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                  {record.timestamp || ''}
                </span>
              </div>
              <div style={{ marginTop: 7, fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                Action: {record.action?.tool_name || ''}
              </div>
              <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                {summarize(record)}
              </div>
              {record.reflection && (
                <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45, wordBreak: 'break-word' }}>
                  Reflection: {record.reflection}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tree Node ────────────────────────────────────────────────────────────────

interface NodeProps {
  slug:     string;
  name:     string;
  fullPath: string;
  isDir:    boolean;
  level:    number;
  selected: string | null;
  onFile:   (path: string) => void;
}

function TreeNode({ slug, name, fullPath, isDir, level, selected, onFile }: NodeProps) {
  const [open, setOpen]         = useState(false);
  const [children, setChildren] = useState<FileItem[]>([]);
  const [loaded, setLoaded]     = useState(false);
  const isSelected = !isDir && selected === fullPath;

  const toggle = async () => {
    if (!isDir) { onFile(fullPath); return; }
    if (!open && !loaded) {
      const items = await fetchProjectFiles(slug, fullPath).catch(() => []);
      setChildren(items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      }));
      setLoaded(true);
    }
    setOpen(o => !o);
  };

  return (
    <div>
      <div
        onClick={toggle}
        className="flex items-center gap-1.5 cursor-pointer select-none"
        style={{
          padding: `4px 8px 4px ${level * 14 + 8}px`,
          fontSize: 12,
          color: isSelected ? 'var(--cm-emerald)' : 'var(--text-secondary)',
          background: isSelected ? 'rgba(52,211,153,0.08)' : 'transparent',
          borderRadius: 6,
          fontWeight: isSelected ? 500 : 400,
          transition: 'background 150ms, color 150ms',
          margin: '1px 4px',
        }}
        onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
        onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
      >
        {isDir ? <FolderIcon open={open} /> : <FileIcon />}
        <span className="truncate">{name}</span>
        {isDir && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
            {open ? '▾' : '▸'}
          </span>
        )}
      </div>
      {open && isDir && (
        <div>
          {children.map(c => (
            <TreeNode key={c.name}
              slug={slug} name={c.name}
              fullPath={fullPath ? `${fullPath}/${c.name}` : c.name}
              isDir={c.isDirectory} level={level + 1}
              selected={selected} onFile={onFile}
            />
          ))}
          {children.length === 0 && (
            <div style={{ paddingLeft: (level + 1) * 14 + 8, fontSize: 11, color: 'var(--text-muted)', padding: '4px 0 4px ' + ((level + 1) * 14 + 8) + 'px' }}>
              (空)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function Preview({ slug, filePath }: { slug: string; filePath: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const binary = ['pptx', 'docx', 'xlsx', 'zip', 'pdf', 'png', 'jpg', 'jpeg'].includes(ext);

   
  useEffect(() => {
    if (binary) { setLoading(false); setContent('__binary__'); return; }
    setLoading(true);
    fetchProjectFileText(slug, filePath)
      .then(setContent).catch(() => setContent('（读取失败）'))
      .finally(() => setLoading(false));
  }, [slug, filePath, binary]);

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
      加载中…
    </div>
  );

  const fileName = filePath.split('/').pop() ?? filePath;

  if (content === '__binary__') {
    const isImg = ['png', 'jpg', 'jpeg'].includes(ext);
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
        {isImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={projectFileUrl(slug, filePath)} alt={fileName}
               style={{ maxWidth: '100%', maxHeight: '70%', borderRadius: 8, border: '1px solid var(--border-subtle)' }}/>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>
              {ext === 'pdf' ? '📄' : ext === 'pptx' ? '📊' : '📁'}
            </div>
            <div style={{ fontSize: 14 }}>{fileName}</div>
            <a href={projectFileUrl(slug, filePath)} download={fileName}
               style={{ color: 'var(--accent)', fontSize: 13, marginTop: 10, display: 'inline-block' }}>
              下载文件
            </a>
          </div>
        )}
      </div>
    );
  }

  if (ext === 'html') {
    return (
      <iframe src={projectFileUrl(slug, filePath)} sandbox="allow-same-origin allow-scripts"
              style={{ width: '100%', height: '100%', border: 'none' }} title={fileName}/>
    );
  }

  if (ext === 'md') {
    return (
      <div className="p-5 overflow-y-auto dc-scroll h-full">
        <div className="dc-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content ?? ''}</ReactMarkdown>
        </div>
      </div>
    );
  }

  if (fileName === 'trajectory_memory.jsonl') {
    return <TrajectoryTimeline content={content ?? ''} />;
  }

  return (
    <pre className="p-5 overflow-auto dc-scroll h-full"
         style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
                  margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'transparent' }}>
      {content}
    </pre>
  );
}

// ─── WorkPanel ────────────────────────────────────────────────────────────────

type PanelMode = 'split' | 'preview' | 'full';

interface Props {
  slug:                string;
  mode:                PanelMode;
  htmlPreview?:        string | null;
  onFileOpen:          () => void;
  onExpand:            () => void;
  onCollapse:          () => void;
  onClosePreview:      () => void;
  onClearHtmlPreview?: () => void;
}

export default function WorkPanel({ slug, mode, htmlPreview, onFileOpen, onExpand, onCollapse, onClosePreview, onClearHtmlPreview }: Props) {
  const [roots, setRoots]           = useState<FileItem[]>([]);
  const [rootsLoading, setLoading]  = useState(true);
  const [selectedFile, setFile]     = useState<string | null>(null);
  const [treeVisible, setTreeVis]   = useState(true);

  const loadRoots = useCallback(async () => {
    setLoading(true);
    const items = await fetchProjectFiles(slug, '').catch(() => []);
    setRoots(items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    }));
    setLoading(false);
  }, [slug]);

   
  useEffect(() => { loadRoots(); }, [loadRoots]);

  const handleFileSelect = (path: string) => {
    setFile(path);
    onFileOpen();
  };

  const handleClose = () => {
    setFile(null);
    onClosePreview();
  };

  const handleCloseHtml = () => {
    onClearHtmlPreview?.();
  };

  // In 'full' mode, auto-collapse tree to give more preview space
  const showTree = mode !== 'full' || treeVisible;
  const treeW = showTree ? 220 : 0;
  const previewVisible = selectedFile !== null || !!htmlPreview;

  return (
    <div className="flex h-full border-l" style={{ borderColor: 'rgba(255,255,255,0.07)', borderLeftWidth: 1, background: 'var(--bg-base)' }}>
      {/* File tree sidebar */}
      <div
        style={{ width: treeW, flexShrink: 0, overflow: 'hidden',
                 transition: 'width 0.25s ease',
                 borderRight: '1px solid rgba(255,255,255,0.07)',
                 display: 'flex', flexDirection: 'column',
                 background: 'var(--bg-surface)' }}
      >
        {/* Tree header */}
        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0"
             style={{ borderColor: 'rgba(255,255,255,0.07)', borderBottomWidth: 1, minWidth: 0 }}>
          <div className="flex items-center gap-1.5" style={{ fontSize: 10, fontWeight: 500,
               color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1 2h3l1.5 2H10v6H1V2z" stroke="rgba(255,255,255,0.3)" strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
            </svg>
            Workspace
          </div>
          <button onClick={loadRoots} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 10, padding: '2px 5px',
            fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em',
            transition: 'color 150ms',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--cm-emerald)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >↻</button>
        </div>

        {/* Tree body */}
        <div className="flex-1 overflow-y-auto py-1 dc-scroll" style={{
          scrollbarWidth: 'thin',
        }}>
          {rootsLoading ? (
            <div style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Loading…</div>
          ) : roots.length === 0 ? (
            <div style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Empty</div>
          ) : (
            roots.map(r => (
              <TreeNode key={r.name} slug={slug} name={r.name} fullPath={r.name}
                        isDir={r.isDirectory} level={0} selected={selectedFile} onFile={handleFileSelect}/>
            ))
          )}
        </div>
      </div>

      {/* Preview pane */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {!previewVisible ? (
          <div className="flex flex-col items-center justify-center h-full gap-2"
               style={{ color: 'var(--text-muted)' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="4" y="4" width="24" height="24" rx="3" stroke="var(--border)" strokeWidth="1.2"/>
              <line x1="9" y1="11" x2="23" y2="11" stroke="var(--border-subtle)" strokeWidth="1"/>
              <line x1="9" y1="16" x2="20" y2="16" stroke="var(--border-subtle)" strokeWidth="1"/>
              <line x1="9" y1="21" x2="17" y2="21" stroke="var(--border-subtle)" strokeWidth="1"/>
            </svg>
            <div style={{ fontSize: 12 }}>点击左侧文件预览</div>
          </div>
        ) : (
          <>
            {/* Preview header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0"
                 style={{ borderColor: 'var(--border)', borderBottomWidth: 2, background: 'var(--bg-surface)' }}>
              {/* Toggle tree (full mode) */}
              {mode === 'full' && (
                <button onClick={() => setTreeVis(v => !v)} className="dc-btn-ghost" style={{ fontSize: 11 }}>
                  {treeVisible ? '‹ 收起' : '› 文件树'}
                </button>
              )}

              <span className="truncate flex-1" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {htmlPreview
                  ? <span style={{ color: 'var(--nb-cyan)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em' }}>AI PREVIEW</span>
                  : selectedFile?.split('/').pop()}
              </span>

              <div className="flex items-center gap-1">
                {mode === 'full' && (
                  <button onClick={onCollapse} className="dc-btn-ghost" title="缩小" style={{ fontSize: 16, padding: '2px 6px' }}>⊡</button>
                )}
                {mode !== 'full' && (
                  <button onClick={onExpand} className="dc-btn-ghost" title="最大化" style={{ fontSize: 16, padding: '2px 6px' }}>⊞</button>
                )}
                <button
                  onClick={htmlPreview ? handleCloseHtml : handleClose}
                  className="dc-btn-ghost" title="关闭预览" style={{ fontSize: 14, padding: '2px 6px' }}
                >✕</button>
              </div>
            </div>

            {/* Preview content */}
            <div className="flex-1 overflow-hidden">
              {htmlPreview ? (
                <iframe
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                    body{margin:0;background:#fff;font-family:'Microsoft YaHei',Arial,sans-serif}
                  </style></head><body>${htmlPreview}</body></html>`}
                  sandbox="allow-same-origin allow-scripts"
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title="AI Preview"
                />
              ) : (
                <Preview slug={slug} filePath={selectedFile!} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
