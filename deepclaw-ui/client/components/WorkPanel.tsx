'use client';

import { useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchProjectFiles, fetchProjectFileText, projectFileUrl, FileItem } from '@/lib/api';

// ─── Icons ────────────────────────────────────────────────────────────────────

function FolderIcon({ open }: { open: boolean }) {
  const c = open ? 'var(--accent-dim)' : 'var(--text-secondary)';
  return (
    <svg width="14" height="13" viewBox="0 0 14 13" fill="none" style={{ flexShrink: 0 }}>
      <path d={open
        ? 'M1 4h12v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z M1 4V3a1 1 0 011-1h2.5l1.5 2H1z'
        : 'M1 3h12v8a1 1 0 01-1 1H2a1 1 0 01-1-1V3z M1 3V2a1 1 0 011-1h2.5l1.5 2H1z'}
        stroke={c} strokeWidth="1.1" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const colors: Record<string, string> = {
    md: 'var(--accent)', html: '#f97316', json: '#eab308', csv: '#22c55e',
    pdf: '#ef4444', png: '#a855f7', jpg: '#a855f7', jpeg: '#a855f7', pptx: '#f97316',
  };
  const c = colors[ext] ?? 'var(--text-secondary)';
  return (
    <svg width="12" height="15" viewBox="0 0 12 15" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2 1h6l3 3v9a1 1 0 01-1 1H2a1 1 0 01-1-1V2a1 1 0 011-1z M8 1v4h3"
            stroke={c} strokeWidth="1.1" strokeLinejoin="round" fill="none"/>
    </svg>
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
        className="flex items-center gap-1.5 cursor-pointer select-none rounded-sm"
        style={{
          padding: `3px 8px 3px ${level * 14 + 8}px`,
          fontSize: 12.5,
          color: isSelected ? 'var(--accent)' : isDir ? 'var(--text-primary)' : 'var(--text-secondary)',
          background: isSelected ? 'rgba(0,200,232,0.1)' : 'transparent',
          borderRadius: 4,
          transition: 'background 0.15s cubic-bezier(0.16, 1, 0.3, 1), color 0.15s',
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
      >
        {isDir ? <FolderIcon open={open} /> : <FileIcon name={name} />}
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
  slug:           string;
  mode:           PanelMode;
  onFileOpen:     () => void;
  onExpand:       () => void;
  onCollapse:     () => void;
  onClosePreview: () => void;
}

export default function WorkPanel({ slug, mode, onFileOpen, onExpand, onCollapse, onClosePreview }: Props) {
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

  // In 'full' mode, auto-collapse tree to give more preview space
  const showTree = mode !== 'full' || treeVisible;
  const treeW = showTree ? 220 : 0;
  const previewVisible = selectedFile !== null;

  return (
    <div className="flex h-full border-l" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-base)' }}>
      {/* File tree sidebar */}
      <div
        style={{ width: treeW, flexShrink: 0, overflow: 'hidden',
                 transition: 'width 0.25s ease', borderRight: '1px solid var(--border-subtle)',
                 display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' }}
      >
        {/* Tree header */}
        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0"
             style={{ borderColor: 'var(--border-subtle)', minWidth: 0 }}>
          <div className="flex items-center gap-1.5" style={{ fontSize: 11, fontWeight: 600,
               color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1 2h3l1.5 2H10v6H1V2z" stroke="var(--accent-dim)" strokeWidth="1.1" strokeLinejoin="round" fill="none"/>
            </svg>
            工作区
          </div>
          <button onClick={loadRoots} className="dc-btn-ghost" style={{ fontSize: 10, padding: '2px 5px' }}>刷新</button>
        </div>

        {/* Tree body */}
        <div className="flex-1 overflow-y-auto dc-scroll py-1">
          {rootsLoading ? (
            <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>加载中…</div>
          ) : roots.length === 0 ? (
            <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>暂无文件</div>
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
                 style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
              {/* Toggle tree (full mode) */}
              {mode === 'full' && (
                <button onClick={() => setTreeVis(v => !v)} className="dc-btn-ghost" style={{ fontSize: 11 }}>
                  {treeVisible ? '‹ 收起' : '› 文件树'}
                </button>
              )}

              <span className="truncate flex-1" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {selectedFile?.split('/').pop()}
              </span>

              <div className="flex items-center gap-1">
                {/* Collapse: preview→split or full→preview */}
                {mode === 'full' && (
                  <button onClick={onCollapse} className="dc-btn-ghost" title="缩小" style={{ fontSize: 16, padding: '2px 6px' }}>⊡</button>
                )}
                {/* Expand: split→preview or preview→full */}
                {mode !== 'full' && (
                  <button onClick={onExpand} className="dc-btn-ghost" title="最大化" style={{ fontSize: 16, padding: '2px 6px' }}>⊞</button>
                )}
                {/* Close */}
                <button onClick={handleClose} className="dc-btn-ghost" title="关闭预览" style={{ fontSize: 14, padding: '2px 6px' }}>✕</button>
              </div>
            </div>

            {/* Preview content */}
            <div className="flex-1 overflow-hidden">
              <Preview slug={slug} filePath={selectedFile!} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
