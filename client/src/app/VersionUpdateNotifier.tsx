import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpCircle, Check, Copy, ExternalLink, RefreshCw, Sparkles, X } from 'lucide-react';
import { API_BASE, apiFetch } from '@/shared/api/client';
import { useT } from '@/shared/i18n';
import { toast } from '@/shared/ui/toast';

export interface VersionInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string;
  releaseNotes?: string;
  publishedAt?: string;
  checkedAt: string;
  source?: 'github' | 'npm';
  error?: string;
}

const DISMISS_KEY = '7server_dismissed_update_version';

export function useAppVersion() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) || '';
    } catch {
      return '';
    }
  });

  const check = useCallback(async (force = false) => {
    setChecking(true);
    try {
      const res = await apiFetch(`${API_BASE}/system/version${force ? '?refresh=1' : ''}`);
      if (!res.ok) return;
      const data = (await res.json()) as VersionInfo;
      setInfo(data);
    } catch {
      // Non-fatal: dashboard stays usable offline
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check(false);
  }, [check]);

  const dismissBanner = useCallback(() => {
    if (!info?.latestVersion) return;
    setDismissedVersion(info.latestVersion);
    try {
      localStorage.setItem(DISMISS_KEY, info.latestVersion);
    } catch {
      /* private mode */
    }
  }, [info?.latestVersion]);

  const showBanner = Boolean(info?.updateAvailable && info?.latestVersion && dismissedVersion !== info.latestVersion);

  return { info, checking, check, showBanner, dismissBanner };
}

export function VersionUpdateBadge({
  info,
  checking,
  onCheck
}: {
  info: VersionInfo | null;
  checking: boolean;
  onCheck: (force?: boolean) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!info) return null;

  const updateCmd = 'npm i -g @nannndev/7server@latest';
  const copyCmd = () => {
    navigator.clipboard?.writeText(updateCmd).then(() => {
      setCopied(true);
      toast.success(t('update.copiedCmd'));
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div ref={popRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={info.updateAvailable && info.latestVersion ? t('update.available') : `7Server v${info.currentVersion}`}
        className={`h-8 px-2 rounded-lg border text-xs font-mono inline-flex items-center gap-1.5 transition-all cursor-pointer ${
          info.updateAvailable
            ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15'
            : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/50'
        }`}
      >
        {info.updateAvailable ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline font-sans font-medium">
              {t('update.badgeLabel', { latest: info.latestVersion || '' })}
            </span>
            <span className="lg:hidden">v{info.latestVersion}</span>
          </>
        ) : (
          <span className="hidden sm:inline text-[11px]">v{info.currentVersion}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl p-3.5 z-50 space-y-3 animate-[pop-in_140ms_ease-out]">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                info.updateAvailable ? 'bg-emerald-500/15 text-emerald-500' : 'bg-[var(--muted)] text-[var(--foreground)]'
              }`}>
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[var(--foreground)]">
                  {info.updateAvailable ? t('update.available') : t('update.upToDate')}
                </div>
                <div className="text-[10.5px] font-mono text-[var(--muted-foreground)]">
                  {t('update.current')}: v{info.currentVersion}
                  {info.latestVersion ? ` · ${t('update.latest')}: v${info.latestVersion}` : ''}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onCheck(true)}
              disabled={checking}
              title={t('update.checkAgain')}
              className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {info.releaseNotes && (
            <div className="max-h-32 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)]/60 p-2.5 text-[11px] leading-relaxed text-[var(--muted-foreground)] whitespace-pre-wrap font-mono">
              {info.releaseNotes}
            </div>
          )}

          {info.updateAvailable && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5">
              <code className="text-[11px] font-mono text-[var(--foreground)] truncate">{updateCmd}</code>
              <button
                type="button"
                onClick={copyCmd}
                title={t('update.copyCmd')}
                className="p-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] shrink-0 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-[10px] text-[var(--muted-foreground)]">
              {info.publishedAt ? new Date(info.publishedAt).toLocaleDateString() : info.source ? `via ${info.source}` : ''}
            </span>
            <a
              href={info.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg btn-metal text-[11px] font-medium"
            >
              <span>{t('update.viewRelease')}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export function VersionUpdateBanner({
  info,
  onDismiss
}: {
  info: VersionInfo;
  onDismiss: () => void;
}) {
  const t = useT();
  if (!info.updateAvailable || !info.latestVersion) return null;

  return (
    <div className="bg-emerald-500/10 border-b border-emerald-500/25 px-4 sm:px-6 py-2 flex items-center justify-between gap-3 text-xs animate-[expand-in_180ms_ease-out]">
      <div className="flex items-center gap-2 min-w-0">
        <ArrowUpCircle className="w-4 h-4 text-emerald-500 shrink-0" />
        <span className="text-[var(--foreground)] font-medium truncate">
          {t('update.bannerText', { latest: info.latestVersion, current: info.currentVersion })}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <a
          href={info.releaseUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-600 dark:text-emerald-300 font-medium text-[11px] transition-colors"
        >
          <span>{t('update.viewRelease')}</span>
          <ExternalLink className="w-3 h-3" />
        </a>
        <button
          type="button"
          onClick={onDismiss}
          title={t('update.dismiss')}
          className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/50 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
