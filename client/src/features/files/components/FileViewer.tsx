import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Save,
  Download,
  Copy,
  Check,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Eye,
  EyeOff,
  Code2,
  FileText,
  FileCode,
  Image as ImageIcon,
  Music,
  Video as VideoIcon,
  Archive,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  WrapText,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { readFile, writeFile, downloadFile, fetchFileBlob } from '@/features/files/api';
import { ServerItem } from '@/features/servers';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { CodeEditorSkeleton } from '@/shared/ui/skeleton';
import { classifyFile, formatBytes } from './viewer/fileTypes';
import MarkdownViewer from './viewer/MarkdownViewer';
import ImageViewer from './viewer/ImageViewer';
import MediaViewer from './viewer/MediaViewer';
import { useT } from '@/shared/i18n';

export { classifyFile } from './viewer/fileTypes';
export type { FileCategory, FileClassification } from './viewer/fileTypes';

interface FileViewerProps {
  server: ServerItem;
  path: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function FileViewer({ server, path, onClose, onSaved }: FileViewerProps) {
  const t = useT();
  const meta = classifyFile(path);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  // Binary blob URL for media files
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blobSize, setBlobSize] = useState<number>(0);

  // Image viewer controls
  const [showSvgSource, setShowSvgSource] = useState(false);

  // Editor modes and states
  const [markdownMode, setMarkdownMode] = useState<'split' | 'preview' | 'edit'>('split');
  const [wrapLines, setWrapLines] = useState(true);
  const [fontSize, setFontSize] = useState<number>(12);
  const [maskEnv, setMaskEnv] = useState(false);
  const [readOnly, setReadOnly] = useState(false);

  // Search inside file
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  // JSON Validation
  const [jsonStatus, setJsonStatus] = useState<{ valid: boolean; error?: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineGutterRef = useRef<HTMLDivElement>(null);

  // Load File Content (Blob or Text)
  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    setLoading(true);
    setError(null);

    const isBinaryMedia = ['image', 'audio', 'video', 'pdf', 'archive', 'binary'].includes(meta.category);

    if (isBinaryMedia && !(meta.ext === 'svg' && showSvgSource)) {
      fetchFileBlob(server.id, path)
        .then((blob) => {
          if (!active) return;
          createdUrl = URL.createObjectURL(blob);
          setBlobUrl(createdUrl);
          setBlobSize(blob.size);
          setLoading(false);
        })
        .catch((err: any) => {
          if (active) {
            setError(err.message || 'Failed to load file media');
            setLoading(false);
          }
        });
    } else {
      readFile(server.id, path)
        .then((txt) => {
          if (!active) return;
          setContent(txt);
          setOriginalContent(txt);
          setLoading(false);
        })
        .catch((err: any) => {
          if (active) {
            setError(err.message || 'Failed to read file content');
            setLoading(false);
          }
        });
    }

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [server.id, path, showSvgSource]);

  // JSON Syntax Validation
  useEffect(() => {
    if (meta.category !== 'json' || !content) {
      setJsonStatus(null);
      return;
    }
    try {
      JSON.parse(content);
      setJsonStatus({ valid: true });
    } catch (e: any) {
      setJsonStatus({ valid: false, error: e.message });
    }
  }, [content, meta.category]);

  // Keyboard Shortcuts (Cmd+S / Ctrl+S to save)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (content !== originalContent && !saving) {
          handleSave();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowSearch((v) => !v);
      } else if (e.key === 'Escape') {
        if (showSearch) {
          setShowSearch(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [content, originalContent, saving, showSearch]);

  const handleSave = async () => {
    if (saving || content === originalContent) return;
    setSaving(true);
    setError(null);
    try {
      await writeFile(server.id, path, content);
      setOriginalContent(content);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2200);
      if (onSaved) onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(content);
      setContent(JSON.stringify(parsed, null, 2));
    } catch (err: any) {
      setError(`Format error: ${err.message}`);
    }
  };

  const handleMinifyJson = () => {
    try {
      const parsed = JSON.parse(content);
      setContent(JSON.stringify(parsed));
    } catch (err: any) {
      setError(`Minify error: ${err.message}`);
    }
  };

  const handleScrollSync = () => {
    if (textareaRef.current && lineGutterRef.current) {
      lineGutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleCursorUpdate = () => {
    const el = textareaRef.current;
    if (!el) return;
    const pos = el.selectionStart || 0;
    const textBefore = el.value.substring(0, pos);
    const line = textBefore.split('\n').length;
    const col = pos - textBefore.lastIndexOf('\n');
    setCursorPos({ line, col });
  };

  const jumpTo = (direction: 'top' | 'bottom') => {
    const el = textareaRef.current;
    if (!el) return;
    if (direction === 'top') {
      el.scrollTop = 0;
      el.setSelectionRange(0, 0);
    } else {
      el.scrollTop = el.scrollHeight;
      el.setSelectionRange(el.value.length, el.value.length);
    }
    el.focus();
    handleCursorUpdate();
  };

  // Mask sensitive values in ENV file
  const displayContent = React.useMemo(() => {
    if (meta.category !== 'env' || !maskEnv) return content;
    return content
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) return line;
        const key = line.slice(0, eqIdx);
        const val = line.slice(eqIdx + 1);
        if (/pass|key|secret|token|auth|cred|private/i.test(key)) {
          return `${key}=••••••••••••••••`;
        }
        return `${key}=${val}`;
      })
      .join('\n');
  }, [content, meta.category, maskEnv]);

  const linesCount = content ? content.split('\n').length : 1;
  const searchMatchesCount =
    searchQuery && content ? (content.toLowerCase().match(new RegExp(searchQuery.toLowerCase(), 'g')) || []).length : 0;

  const isModified = content !== originalContent;


  return (
    <div className="flex-1 flex flex-col bg-[var(--card)] overflow-hidden animate-in fade-in">
      {/* Dynamic File Header Bar */}
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--background)] flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          {/* File Type Icon */}
          <div className="p-1 rounded bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] shrink-0">
            {meta.category === 'image' ? (
              <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
            ) : meta.category === 'audio' ? (
              <Music className="w-3.5 h-3.5 text-purple-400" />
            ) : meta.category === 'video' ? (
              <VideoIcon className="w-3.5 h-3.5 text-rose-400" />
            ) : meta.category === 'archive' ? (
              <Archive className="w-3.5 h-3.5 text-amber-400" />
            ) : meta.category === 'json' ? (
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            ) : meta.category === 'markdown' ? (
              <FileText className="w-3.5 h-3.5 text-sky-400" />
            ) : (
              <FileCode className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </div>

          <div className="min-w-0 flex items-center gap-2">
            <span className="font-semibold text-[var(--foreground)] truncate font-mono text-xs">{meta.filename}</span>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 font-mono text-[var(--muted-foreground)]">
              {meta.language}
            </Badge>
            {isModified && <span className="text-[10px] text-amber-500 font-sans font-medium">● Belum Disimpan</span>}
          </div>
        </div>

        {/* Adaptive Controls Based on File Category */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Category-Specific Toolbar Buttons */}
          {meta.category === 'json' && (
            <div className="flex items-center gap-1 mr-1">
              <Button variant="outline" size="sm" onClick={handleFormatJson} className="h-7 text-[11px] gap-1">
                {t('files.formatJson')}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleMinifyJson} className="h-7 text-[11px] gap-1">
                {t('files.minifyJson')}
              </Button>
            </div>
          )}

          {meta.category === 'env' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMaskEnv(!maskEnv)}
              className="h-7 text-[11px] gap-1 mr-1"
              title={maskEnv ? t('files.unmaskSecret') : t('files.maskSecret')}
            >
              {maskEnv ? <Eye className="w-3 h-3 text-sky-400" /> : <EyeOff className="w-3 h-3" />}
              {maskEnv ? t('files.unmaskSecret') : t('files.maskSecret')}
            </Button>
          )}

          {meta.category === 'markdown' && (
            <div className="flex rounded border border-[var(--border)] mr-1 p-0.5 bg-[var(--muted)]/50">
              {(['split', 'preview', 'edit'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMarkdownMode(m)}
                  className={`px-2 py-0.5 text-[10px] capitalize rounded transition ${
                    markdownMode === m
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {meta.category === 'log' && (
            <div className="flex items-center gap-1 mr-1">
              <Button variant="ghost" size="sm" onClick={() => jumpTo('top')} className="h-7 text-[11px] gap-1">
                <ArrowUp className="w-3 h-3" /> Top
              </Button>
              <Button variant="ghost" size="sm" onClick={() => jumpTo('bottom')} className="h-7 text-[11px] gap-1">
                <ArrowDown className="w-3 h-3" /> End
              </Button>
            </div>
          )}

          {meta.ext === 'svg' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSvgSource(!showSvgSource)}
              className="h-7 text-[11px] gap-1 mr-1"
            >
              <Code2 className="w-3 h-3" /> {showSvgSource ? 'Preview SVG' : 'Edit Source XML'}
            </Button>
          )}

          {/* General Text Controls */}
          {meta.canEdit && !showSvgSource && meta.category !== 'image' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setWrapLines(!wrapLines)}
                className={`h-7 w-7 ${wrapLines ? 'text-sky-400' : 'text-[var(--muted-foreground)]'}`}
                title={t('files.wrapText')}
              >
                <WrapText className="w-3.5 h-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSearch(!showSearch)}
                className={`h-7 w-7 ${showSearch ? 'text-sky-400' : 'text-[var(--muted-foreground)]'}`}
                title={t('files.searchInFile')}
              >
                <Search className="w-3.5 h-3.5" />
              </Button>

              <div className="flex items-center border border-[var(--border)] rounded px-1 text-[10px] font-mono text-[var(--muted-foreground)]">
                <button
                  onClick={() => setFontSize((s) => Math.max(10, s - 1))}
                  className="px-1 hover:text-[var(--foreground)]"
                  title="A-"
                >
                  A-
                </button>
                <span className="px-1 border-x border-[var(--border)]">{fontSize}</span>
                <button
                  onClick={() => setFontSize((s) => Math.min(18, s + 1))}
                  className="px-1 hover:text-[var(--foreground)]"
                  title="A+"
                >
                  A+
                </button>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                className="h-7 w-7 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                title={t('files.copyAll')}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </>
          )}

          {/* Download Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadFile(server.id, path)}
            className="h-7 text-xs gap-1"
            title={t('files.download')}
          >
            <Download className="w-3 h-3" /> {t('files.download')}
          </Button>

          {/* Save Button for Editable Files */}
          {meta.canEdit && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !isModified}
              className="h-7 text-xs gap-1 font-semibold"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> {t('files.saved')}
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" /> {saving ? t('files.saving') : t('common.save')}
                </>
              )}
            </Button>
          )}

          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Floating In-File Search Bar */}
      {showSearch && (
        <div className="px-4 py-1.5 bg-[var(--background)] border-b border-[var(--border)] flex items-center gap-2 text-xs">
          <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
          <Input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('files.searchPlaceholder')}
            className="h-7 text-xs flex-1 max-w-sm font-mono"
          />
          <span className="text-[11px] text-[var(--muted-foreground)] font-mono">
            {searchQuery ? `${searchMatchesCount} matches` : ''}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setShowSearch(false)} className="h-6 w-6 ml-auto">
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* JSON Syntax Status Banner */}
      {jsonStatus && (
        <div
          className={`px-4 py-1 text-[11px] font-mono flex items-center justify-between border-b ${
            jsonStatus.valid
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}
        >
          <span className="flex items-center gap-1.5">
            {jsonStatus.valid ? (
              <>
                <CheckCircle2 className="w-3 h-3" /> Format JSON Valid
              </>
            ) : (
              <>
                <AlertTriangle className="w-3 h-3" /> Syntax Error: {jsonStatus.error}
              </>
            )}
          </span>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-zinc-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Main Content Area Adapts to Category */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {loading ? (
          <div className="flex-1 p-4 overflow-hidden bg-[#09090b]">
            <CodeEditorSkeleton lines={18} />
          </div>
        ) : meta.category === 'image' && !(meta.ext === 'svg' && showSvgSource) ? (
          <ImageViewer blobUrl={blobUrl} blobSize={blobSize} filename={meta.filename} />
        ) : ['audio', 'video', 'archive', 'binary'].includes(meta.category) ? (
          <MediaViewer meta={meta} blobUrl={blobUrl} blobSize={blobSize} serverId={server.id} path={path} />
        ) : meta.category === 'markdown' && markdownMode === 'preview' ? (
          /* ================= MARKDOWN ONLY PREVIEW ================= */
          <div className="flex-1 overflow-auto bg-[#09090b]">
            <MarkdownViewer content={content} />
          </div>
        ) : meta.category === 'markdown' && markdownMode === 'split' ? (
          /* ================= MARKDOWN SPLIT VIEW ================= */
          <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-[var(--border)] overflow-hidden">
            {/* Left: Code Editor */}
            <div className="flex-1 flex overflow-hidden bg-[#09090b]">
              <div
                ref={lineGutterRef}
                className="w-12 py-3 pr-2 text-right select-none font-mono text-zinc-600 border-r border-zinc-800 overflow-hidden shrink-0"
                style={{ fontSize: `${fontSize}px`, lineHeight: 1.5 }}
              >
                {Array.from({ length: linesCount }).map((_, i) => (
                  <div key={i + 1}>{i + 1}</div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onScroll={handleScrollSync}
                onKeyUp={handleCursorUpdate}
                onClick={handleCursorUpdate}
                spellCheck={false}
                style={{ fontSize: `${fontSize}px`, lineHeight: 1.5 }}
                className="flex-1 p-3 bg-transparent font-mono text-zinc-200 resize-none focus:outline-none whitespace-pre overflow-auto"
              />
            </div>
            {/* Right: Rendered Markdown */}
            <div className="flex-1 overflow-auto bg-[#0e0e11]">
              <MarkdownViewer content={content} />
            </div>
          </div>
        ) : (
          /* ================= TEXT / CODE / CONFIG / LOG EDITOR ================= */
          <div className="flex-1 flex overflow-hidden bg-[#09090b]">
            {/* Line Number Gutter */}
            <div
              ref={lineGutterRef}
              className="w-12 py-3 pr-2 text-right select-none font-mono text-zinc-600 border-r border-zinc-800 overflow-hidden shrink-0 bg-zinc-950/60"
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.5 }}
            >
              {Array.from({ length: linesCount }).map((_, i) => (
                <div key={i + 1} className={cursorPos.line === i + 1 ? 'text-sky-400 font-bold' : ''}>
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Actual Code Textarea */}
            <textarea
              ref={textareaRef}
              value={displayContent}
              onChange={(e) => {
                if (maskEnv) setMaskEnv(false);
                setContent(e.target.value);
              }}
              onScroll={handleScrollSync}
              onKeyUp={handleCursorUpdate}
              onClick={handleCursorUpdate}
              spellCheck={false}
              readOnly={readOnly}
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.5 }}
              className={`flex-1 p-3 bg-transparent font-mono text-zinc-100 resize-none focus:outline-none overflow-auto leading-relaxed ${
                wrapLines ? 'whitespace-pre-wrap' : 'whitespace-pre'
              }`}
            />
          </div>
        )}
      </div>

      {/* Editor Status Footer Bar */}
      <div className="px-4 py-1.5 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-[11px] font-mono text-[var(--muted-foreground)]">
        <div className="flex items-center gap-4">
          <span>{meta.language}</span>
          <span>UTF-8</span>
          {meta.canEdit && (
            <span>
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
          )}
          <span>{linesCount} baris</span>
          <span>{content.length.toLocaleString()} karakter</span>
        </div>

        <div className="flex items-center gap-3">
          {isModified ? (
            <span className="text-amber-500 font-sans">Perubahan belum disimpan (⌘S)</span>
          ) : (
            <span className="text-emerald-500 flex items-center gap-1 font-sans">
              <Check className="w-3 h-3" /> Sinkron dengan server
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

