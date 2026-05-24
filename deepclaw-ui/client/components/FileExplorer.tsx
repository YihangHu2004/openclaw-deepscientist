'use client';

import { useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchFiles, fetchFileText, fileUrl, FileItem } from '@/lib/api';

// ─── File type icon ───────────────────────────────────────────────────────────
function FileTypeIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  // Custom fine-line SVG per type
  const paths: Record<string, { d: string; color: string }> = {
    md:   { d: 'M4 4h8v10H4z M6 7h4 M6 9h4 M6 11h2', color: '#0a7ea4' },
    html: { d: 'M3 4l1.5 10L8 15l3.5-1L14 4 M6 8h4 M5.5 11h5', color: '#f97316' },
    json: { d: 'M5 4C5 4 4 5 4 7S5 9 5 10S4 11 4 13 M11 4C11 4 12 5 12 7S11 9 11 10S12 11 12 13', color: '#eab308' },
    pdf:  { d: 'M4 2h7l3 3v11H4z M10 2v4h4 M6 9h4 M6 11h3', color: '#ef4444' },
    csv:  { d: 'M3 5h10 M3 8h10 M3 11h10 M6 3v10 M9 3v10', color: '#22c55e' },
    png:  { d: 'M3 3h10v10H3z M5 8l2-2 2 2 2-3', color: '#a855f7' },
    jpg:  { d: 'M3 3h10v10H3z M5 8l2-2 2 2 2-3', color: '#a855f7' },
  };
  const def = { d: 'M4 2h7l3 3v11H4z M10 2v4h4', color: '#64748b' };
  const { d, color } = paths[ext] ?? def;

  return (
    <svg width="14" height="16" viewBox="0 0 14 16" fill="none" style={{ flexShrink: 0 }}>
      <path d={d} stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// ─── Folder icon ──────────────────────────────────────────────────────────────
function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="none" style={{ flexShrink: 0 }}>
      <path d={open
        ? 'M1 4h13v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z M1 4V3a1 1 0 011-1h3l1.5 2H1z'
        : 'M1 3h13v8a1 1 0 01-1 1H2a1 1 0 01-1-1V3z M1 3V2a1 1 0 011-1h3l1.5 2H1z'}
        stroke={open ? '#0a7ea4' : '#64748b'} strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// ─── Lazy tree node ───────────────────────────────────────────────────────────
interface NodeProps {
  name:     string;
  fullPath: string;
  isDir:    boolean;
  level:    number;
  onFile:   (path: string) => void;
}

function TreeNode({ name, fullPath, isDir, level, onFile }: NodeProps) {
  const [open, setOpen]         = useState(false);
  const [children, setChildren] = useState<FileItem[]>([]);
  const [loaded, setLoaded]     = useState(false);

  const toggle = async () => {
    if (!isDir) { onFile(fullPath); return; }
    if (!open && !loaded) {
      const items = await fetchFiles(fullPath).catch(() => []);
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
        className="flex items-center gap-1.5 cursor-pointer select-none transition-colors rounded-sm"
        style={{
          padding: `4px 8px 4px ${level * 14 + 8}px`,
          fontSize: 13,
          color: '#334155',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#e8f4f8')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {isDir
          ? <FolderIcon open={open} />
          : <FileTypeIcon name={name} />
        }
        <span className="truncate" style={{ color: isDir ? '#1e293b' : '#475569' }}>{name}</span>
        {isDir && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#94a3b8' }}>
            {open ? '▾' : '▸'}
          </span>
        )}
      </div>
      {open && isDir && (
        <div>
          {children.map(c => (
            <TreeNode
              key={c.name}
              name={c.name}
              fullPath={fullPath ? `${fullPath}/${c.name}` : c.name}
              isDir={c.isDirectory}
              level={level + 1}
              onFile={onFile}
            />
          ))}
          {children.length === 0 && (
            <div style={{ paddingLeft: (level + 1) * 14 + 8, fontSize: 12, color: '#94a3b8', padding: '4px 0 4px ' + ((level + 1) * 14 + 8) + 'px' }}>
              (空)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Preview pane ─────────────────────────────────────────────────────────────
function Preview({ filePath }: { filePath: string | null }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!filePath) { setContent(null); return; }
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    if (['pptx', 'docx', 'xlsx', 'zip', 'pdf', 'png', 'jpg', 'jpeg'].includes(ext)) {
      setContent('__binary__');
      return;
    }
    setLoading(true);
    fetchFileText(filePath)
      .then(setContent)
      .catch(() => setContent('（读取失败）'))
      .finally(() => setLoading(false));
  }, [filePath]);

  if (!filePath) return (
    <div className="flex items-center justify-center h-full" style={{ color: '#cbd5e1', fontSize: 13 }}>
      点击文件预览
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: '#94a3b8', fontSize: 13 }}>
      加载中…
    </div>
  );

  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const fileName = filePath.split('/').pop() ?? filePath;

  if (content === '__binary__') {
    const imgExts = ['png', 'jpg', 'jpeg'];
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
        {imgExts.includes(ext) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(filePath)} alt={fileName} style={{ maxWidth: '100%', maxHeight: '60%', borderRadius: 6 }} />
        ) : (
          <div style={{ fontSize: 13, color: '#475569', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>
              {ext === 'pdf' ? '📄' : ext === 'pptx' ? '📊' : ext === 'docx' ? '📝' : '📁'}
            </div>
            <div>{fileName}</div>
            <a
              href={fileUrl(filePath)}
              download={fileName}
              style={{ color: 'var(--dc-teal)', fontSize: 13, marginTop: 8, display: 'inline-block' }}
            >
              下载文件
            </a>
          </div>
        )}
      </div>
    );
  }

  if (ext === 'html') {
    return (
      <iframe
        src={fileUrl(filePath)}
        sandbox="allow-same-origin allow-scripts"
        style={{ width: '100%', height: '100%', border: 'none' }}
        title={fileName}
      />
    );
  }

  if (ext === 'md') {
    return (
      <div className="p-4 overflow-y-auto dc-scroll h-full">
        <div className="dc-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content ?? ''}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <pre
      className="p-4 overflow-auto dc-scroll h-full"
      style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#334155', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
    >
      {content}
    </pre>
  );
}

// ─── FileExplorer ─────────────────────────────────────────────────────────────

export default function FileExplorer() {
  const [roots, setRoots]         = useState<FileItem[]>([]);
  const [selectedFile, setFile]   = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [previewOpen, setPreview] = useState(false);

  const loadRoots = useCallback(async () => {
    setLoading(true);
    const items = await fetchFiles('').catch(() => []);
    setRoots(items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    }));
    setLoading(false);
  }, []);

  useEffect(() => { loadRoots(); }, [loadRoots]);

  const handleFile = (path: string) => {
    setFile(path);
    setPreview(true);
  };

  return (
    <div
      className="flex flex-col h-full border-l"
      style={{ background: 'var(--dc-files)', borderColor: 'var(--dc-border)', width: 300, flexShrink: 0 }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b"
        style={{ borderColor: 'var(--dc-border)', background: 'white' }}
      >
        <div className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 2h4l1.5 2H13v8H1V2z" stroke="#0a7ea4" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
          </svg>
          工作区文件
        </div>
        <button
          onClick={loadRoots}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 11 }}
        >
          刷新
        </button>
      </div>

      {/* Tree */}
      <div className="overflow-y-auto dc-scroll" style={{ flex: previewOpen ? '0 0 40%' : 1 }}>
        {loading ? (
          <div style={{ padding: '12px 16px', fontSize: 13, color: '#94a3b8' }}>加载中…</div>
        ) : roots.length === 0 ? (
          <div style={{ padding: '12px 16px', fontSize: 13, color: '#94a3b8' }}>暂无文件</div>
        ) : (
          roots.map(r => (
            <TreeNode
              key={r.name}
              name={r.name}
              fullPath={r.name}
              isDir={r.isDirectory}
              level={0}
              onFile={handleFile}
            />
          ))
        )}
      </div>

      {/* Preview divider + pane */}
      {previewOpen && selectedFile && (
        <>
          <div
            className="flex items-center justify-between px-3 py-1.5 border-t border-b"
            style={{ borderColor: 'var(--dc-border)', background: 'white', fontSize: 11 }}
          >
            <span className="truncate" style={{ color: '#475569', maxWidth: 180 }}>{selectedFile.split('/').pop()}</span>
            <button
              onClick={() => setPreview(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12 }}
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Preview filePath={selectedFile} />
          </div>
        </>
      )}
    </div>
  );
}
