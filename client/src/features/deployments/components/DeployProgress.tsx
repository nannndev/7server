// Step 3 of the deploy wizard: live stages + log of the background deploy task.
import { useState, useEffect, useRef, useMemo } from 'react';
import { Check, ExternalLink, RefreshCw, Cpu, Terminal, Copy, CheckCircle2, Activity, Sparkles, Clock, Play, AlertTriangle } from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { toast } from '@/shared/ui/toast';
import { execOnServer } from '@/features/copilot/api';
import { useT } from '@/shared/i18n';
import type { ServerItem } from '@/features/servers/types';
import type { BackgroundTask } from '@/shared/tasks/types';

export interface PipelineStage {
  id: string;
  label: string;
  sub: string;
  brand: string;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  duration?: string;
}

// Full ANSI/VT escape set (colors, cursor moves, PM2's table styling); \x1b[ codes and also stray "[39m" left after chunk splits.
export const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\[[0-9;]{1,8}m/g, '');

/** Stage status comes from "@@STAGE <id>" markers in the task log; the last one seen is the active stage. */
export function deriveStages(task: BackgroundTask | undefined, defs: PipelineStage[]): PipelineStage[] {
  // shortcut: assumes "@@STAGE <id>" arrives as a whole line in one SSH chunk; buffer partial lines in appendTaskLog if stages ever stall.
  const seen = task?.stages ?? [];
  const current = seen[seen.length - 1];
  const tail: PipelineStage['status'] = task?.status === 'success' ? 'completed' : task?.status === 'failed' ? 'failed' : 'running';
  return defs.map((sd) => ({ ...sd, status: !seen.includes(sd.id) ? 'waiting' : sd.id === current ? tail : 'completed' }));
}

export interface StackServiceItem {
  id: string;
  appName: string;
  rootDir: string;
  framework: string;
  port: number;
  domain?: string;
  task?: BackgroundTask;
  stageDefs: PipelineStage[];
  status: 'waiting' | 'running' | 'completed' | 'failed';
}

export function DeployProgress({
  task: deployTask,
  stageDefs,
  server,
  framework: activeFramework,
  repoName,
  branch: selectedBranch,
  appName,
  port: internalPort,
  domain: customDomain,
  services,
  onBackToConfig,
  onRetry,
  onDone,
  onRetryService,
  onContinueStack
}: {
  task: BackgroundTask | undefined;
  stageDefs: PipelineStage[];
  server: ServerItem;
  framework: string;
  repoName?: string;
  branch: string;
  appName: string;
  port: number;
  domain: string;
  services?: StackServiceItem[];
  onBackToConfig: () => void;
  onRetry: () => void;
  onDone: () => void;
  onRetryService?: (serviceId: string) => void;
  onContinueStack?: () => void;
}) {
  const t = useT();
  const [activeServiceIdx, setActiveServiceIdx] = useState(0);

  // Auto-switch to running service when previous completes
  useEffect(() => {
    if (!services || services.length <= 1) return;
    const runningIdx = services.findIndex((s) => s.status === 'running');
    if (runningIdx !== -1 && services[activeServiceIdx]?.status === 'completed') {
      setActiveServiceIdx(runningIdx);
    }
  }, [services, activeServiceIdx]);

  const currentSvc = services && services.length > 0 ? services[activeServiceIdx] : undefined;
  const currentTask = currentSvc ? currentSvc.task : deployTask;
  const currentStageDefs = currentSvc ? currentSvc.stageDefs : stageDefs;
  const currentAppName = currentSvc ? currentSvc.appName : appName;
  const currentPort = currentSvc ? currentSvc.port : internalPort;
  const currentDomain = currentSvc ? currentSvc.domain || '' : customDomain;
  const currentFramework = currentSvc ? currentSvc.framework : activeFramework;

  const isStack = Boolean(services && services.length > 1);
  const [manualSuccess, setManualSuccess] = useState(false);
  const [checkingPort, setCheckingPort] = useState(false);

  const allCompleted = isStack ? services!.every((s) => s.status === 'completed') : currentTask?.status === 'success';
  const anyFailed = isStack ? services!.some((s) => s.status === 'failed') : currentTask?.status === 'failed';
  const stackRunning = isStack && !allCompleted && !anyFailed;

  const deployFinished = (!isStack ? currentTask?.status === 'success' : allCompleted) || manualSuccess;
  const deployFailed = (!isStack ? currentTask?.status === 'failed' : anyFailed) && !manualSuccess;
  const elapsedSec = currentTask?.durationSec ?? 0;
  // Stage markers and the wrapper's exit-code marker are protocol, not output.
  const logs = useMemo(
    () => (currentTask?.logs ?? []).filter((l) => !l.startsWith('@@STAGE') && !l.startsWith('__7SERVER_')),
    [currentTask?.logs]
  );
  const failureHint = useMemo(() => {
    if (!deployFailed || logs.length === 0) return '';
    const clean = logs.slice(-50).map((l) => stripAnsi(l).trim()).filter(Boolean);
    const ignoreRe = /^(===|---|Tearing down|Files preserved|Set Internal Port|Nothing is answering|Container\(s\) crashed|Deployment failed: container|Detected crashed|Ports listening|Recent container logs)/i;
    const logMarkerIdx = [...clean].reverse().findIndex((l) => /^Recent container logs:|^--- Logs:/i.test(l));
    if (logMarkerIdx !== -1) {
      const startIdx = clean.length - 1 - logMarkerIdx + 1;
      const candidate = clean.slice(startIdx).find((l) => !ignoreRe.test(l) && !/^(Detected container|Container crash)/i.test(l));
      if (candidate) return candidate;
    }
    const errLine = [...clean].reverse().find((l) => !ignoreRe.test(l) && /(fatal|panic|error|gagal|wajib|eaddrinuse|enoent|exception|permission denied|exited \([1-9])/i.test(l));
    return errLine || '';
  }, [deployFailed, logs]);
  const stages = useMemo(() => {
    const derived = deriveStages(currentTask, currentStageDefs);
    if (manualSuccess) {
      return derived.map((s) => ({ ...s, status: 'completed' as const }));
    }
    return derived;
  }, [currentTask?.stages, currentTask?.status, currentStageDefs, manualSuccess]);
  const selectedRepo = repoName ? { full_name: repoName } : null;
  const [copiedLog, setCopiedLog] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const handleRecheckPort = async () => {
    setCheckingPort(true);
    try {
      const curlRes = await execOnServer(
        server.id,
        `curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 3 http://127.0.0.1:${currentPort} 2>/dev/null || true`
      );
      const code = curlRes.stdout.trim();
      if (code && code !== '000' && !code.startsWith('5')) {
        toast.success(t('gitApp.portActive', { port: currentPort, code }));
        setManualSuccess(true);
        return;
      }

      const ssRes = await execOnServer(
        server.id,
        `ss -ltnH "sport = :${currentPort}" 2>/dev/null | grep -q . && echo "LISTENING" || echo "CLOSED"`
      );
      if (ssRes.stdout.includes('LISTENING')) {
        toast.success(t('gitApp.portListening', { port: currentPort }));
        setManualSuccess(true);
        return;
      }

      toast.error(t('gitApp.portStillDown', { port: currentPort, code: code || '000' }));
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify port status');
    } finally {
      setCheckingPort(false);
    }
  };

  // Follow the log only while the user is at the bottom, so scrolling up to read an error sticks.
  useEffect(() => {
    if (stickToBottom.current && terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);

  const copyLogText = () => {
    navigator.clipboard.writeText(logs.map(stripAnsi).join('\n'));
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  const handleAskAi = () => {
    const failedStage = stages.find((s) => s.status === 'failed');
    const recentLogs = logs.slice(-35).map(stripAnsi).join('\n');
    const prompt = `The deployment of app "${currentAppName}" (repo: ${selectedRepo?.full_name || currentAppName}, branch: ${selectedBranch}, port: ${currentPort}) FAILED at stage "${failedStage?.label || 'Deployment'}".

Error summary and recent logs:
\`\`\`
${recentLogs.slice(-2500)}
\`\`\`

Please check the process and container status on the server, analyze the root cause of this failure, and help fix the configuration until the app is reachable on port ${currentPort}.`;

    window.dispatchEvent(
      new CustomEvent('7server-copilot-ask', {
        detail: { prompt }
      })
    );
  };

  return (
    <div className="space-y-5">
      {/* Multi-Service Stack Visual Pipeline */}
      {isStack && (
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xs space-y-3.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--primary)]" />
              <span className="text-xs font-bold text-[var(--foreground)]">
                Monorepo Deployment Stack ({services!.length} Packages)
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-[var(--muted-foreground)]">
                Live: <span className="text-emerald-400 font-bold">{services!.filter((s) => s.status === 'completed').length}</span> / {services!.length}
              </span>
              {services!.some((s) => s.status === 'failed') && (
                <span className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] font-semibold">
                  {services!.filter((s) => s.status === 'failed').length} Failed
                </span>
              )}
            </div>
          </div>

          {/* Connected service cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {services!.map((svc, idx) => {
              const isActive = activeServiceIdx === idx;
              return (
                <div
                  key={svc.id}
                  onClick={() => setActiveServiceIdx(idx)}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer relative overflow-hidden select-none flex flex-col justify-between gap-2.5 ${
                    isActive
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 ring-1 ring-[var(--primary)] shadow-sm'
                      : 'border-[var(--border)] bg-[var(--muted)]/30 hover:bg-[var(--muted)]/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center shrink-0">
                        <BrandIcon name={svc.framework} className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[var(--foreground)] truncate font-mono">
                          {svc.appName}
                        </div>
                        <div className="text-[10px] text-[var(--muted-foreground)] truncate font-mono">
                          {svc.rootDir}
                        </div>
                      </div>
                    </div>

                    <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                      :{svc.port}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]/50 text-[11px]">
                    <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                      #{idx + 1}
                    </span>

                    {svc.status === 'completed' && (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Live
                      </span>
                    )}
                    {svc.status === 'running' && (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-sky-400">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deploying
                      </span>
                    )}
                    {svc.status === 'failed' && (
                      <span className="inline-flex items-center gap-1 font-semibold text-red-400">
                        <AlertTriangle className="w-3.5 h-3.5" /> Failed
                      </span>
                    )}
                    {svc.status === 'waiting' && (
                      <span className="inline-flex items-center gap-1 text-[var(--muted-foreground)] font-mono">
                        <Clock className="w-3.5 h-3.5 opacity-60" /> Queued
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Overall Stack Progress Bar */}
          <div className="w-full bg-[var(--muted)] h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                services!.some((s) => s.status === 'failed')
                  ? 'bg-red-500'
                  : 'bg-gradient-to-r from-[var(--primary)] to-emerald-400'
              }`}
              style={{
                width: `${Math.max(5, (services!.filter((s) => s.status === 'completed').length / services!.length) * 100)}%`
              }}
            />
          </div>
        </div>
      )}
      {/* Top Mission Control Status Card */}
      <Card className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center shrink-0">
            <BrandIcon
              name={currentFramework}
              className="w-6 h-6"
              fallback={<Cpu className="w-6 h-6 text-[var(--foreground)]" />}
            />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-base font-bold text-[var(--foreground)]">
                {deployFinished
                  ? (isStack ? `Monorepo Stack Deployed 🎉 (${services!.length} Services Live)` : t('gitApp.deploySuccess'))
                  : deployFailed
                  ? (isStack ? `Stack Deployment Failed on ${currentAppName}` : t('gitApp.deployFailed'))
                  : (isStack ? `Deploying Stack (${services!.filter((s) => s.status === 'completed').length + 1}/${services!.length}): ${currentAppName}` : t('gitApp.deployInProgress'))}
              </h3>
              {deployFinished ? (
                <Badge variant="success" className="text-[10px] gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {t('gitApp.statusLive')}
                </Badge>
              ) : deployFailed ? (
                <Badge variant="destructive" className="text-[10px]">{currentTask?.error || t('gitApp.deployFailed')}</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] gap-1 animate-pulse">
                  <Activity className="w-3 h-3 text-emerald-400" /> {t('gitApp.statusBuilding', { sec: elapsedSec })}
                </Badge>
              )}
            </div>
            <div className="text-xs text-[var(--muted-foreground)] font-mono mt-1 flex items-center gap-2 flex-wrap">
              <span>{selectedRepo?.full_name}</span>
              <span>•</span>
              <span>Branch: {selectedBranch}</span>
              <span>•</span>
              <span>Path: /var/www/{currentAppName}</span>
              <span>•</span>
              <span>Port: :{currentPort}</span>
            </div>
          </div>
        </div>

        {deployFailed && (
          <div className="flex items-center gap-2 flex-wrap">
            {isStack && onRetryService && currentSvc?.status === 'failed' && (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => onRetryService(currentSvc.id)}
                className="h-9 px-3.5 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry {currentAppName}</span>
              </Button>
            )}
            {isStack && onContinueStack && services!.some((s) => s.status === 'waiting') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onContinueStack}
                className="h-9 px-3.5 text-xs gap-1.5 border-purple-500/40 text-purple-400 hover:bg-purple-500/10 font-medium"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Skip & Deploy Next ({services!.filter((s) => s.status === 'waiting').length})</span>
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRecheckPort}
              disabled={checkingPort}
              className="h-9 px-3.5 text-xs gap-1.5 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingPort ? 'animate-spin' : ''}`} />
              <span>{t('gitApp.recheckPort', { port: currentPort })}</span>
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleAskAi}
              className="h-9 px-3.5 text-xs gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              <span>{t('gitApp.fixWithAi')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onBackToConfig} className="h-9 px-4 text-xs">
              {t('gitApp.backToConfig')}
            </Button>
            <Button variant="default" size="sm" onClick={onRetry} className="h-9 px-4 text-xs">
              {isStack ? 'Retry Entire Stack' : t('gitApp.retryDeploy')}
            </Button>
          </div>
        )}
        {deployFinished && (
          <div className="flex items-center gap-2 flex-wrap">
            {isStack ? (
              services!.map((svc) => (
                <a
                  key={svc.id}
                  href={`http://${svc.domain || `${server.host}:${svc.port}`}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition"
                >
                  <BrandIcon name={svc.framework} className="w-3 h-3" />
                  <span>Visit {svc.appName}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))
            ) : (
              <a
                href={`http://${currentDomain || `${server.host}:${currentPort}`}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition"
              >
                <span>{t('gitApp.visitApp')}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={onDone}
              className="h-9 px-4 text-xs"
            >
              {t('gitApp.done')}
            </Button>
          </div>
        )}
      </Card>

      {/* AI Diagnostic Banner when deployment fails */}
      {deployFailed && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-500 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="text-xs font-bold text-[var(--foreground)] flex items-center gap-2">
                <span>{t('gitApp.aiDiagnoseTitle')}</span>
                <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-500 dark:text-amber-400 font-mono">Autonomous SRE</Badge>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5 leading-relaxed">
                {t('gitApp.aiDiagnoseDesc')}
              </p>
              {failureHint && (
                <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25 text-[11px] font-mono text-red-500 dark:text-red-400 break-all">
                  {failureHint}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRecheckPort}
              disabled={checkingPort}
              className="gap-1.5 h-9 px-3.5 text-xs font-medium border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingPort ? 'animate-spin' : ''}`} />
              <span>{t('gitApp.recheckPort', { port: currentPort })}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAskAi}
              className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold text-xs shadow-md h-9 px-4"
            >
              <Sparkles className="w-4 h-4 fill-current" />
              <span>{t('gitApp.fixWithAi')}</span>
            </Button>
          </div>
        </div>
      )}

      {/* 2-Column Pipeline Stages + Wide Terminal Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (4 cols): Vertical Pipeline Stages */}
        <Card className="lg:col-span-4 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
              {t('gitApp.pipelineStages')}
            </span>
            <span className="text-[11px] font-mono text-[var(--muted-foreground)]">
              {stages.filter((s) => s.status === 'completed').length}/{stages.length}
            </span>
          </div>

          <div className="space-y-2">
            {stages.map((stg) => (
              <div
                key={stg.id}
                className={`p-3 rounded-xl border text-xs transition flex items-center justify-between gap-3 ${
                  stg.status === 'failed'
                    ? 'border-red-500/40 bg-red-500/5 text-red-600 dark:text-red-400'
                    : stg.status === 'completed'
                    ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
                    : stg.status === 'running'
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)] shadow-xs'
                    : 'border-[var(--border)] bg-[var(--background)]/40 text-[var(--muted-foreground)] opacity-60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center shrink-0">
                    <BrandIcon
                      name={stg.brand}
                      className="w-3.5 h-3.5"
                      fallback={<Terminal className="w-3.5 h-3.5" />}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-xs truncate text-[var(--foreground)]">
                      {stg.label}
                    </div>
                    <div className="text-[10px] text-[var(--muted-foreground)] font-mono truncate">
                      {stg.sub}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-[var(--muted-foreground)]">
                    {stg.duration || t(stg.status === 'running' ? 'gitApp.statusRunning' : stg.status === 'completed' ? 'gitApp.statusDone' : stg.status === 'failed' ? 'gitApp.deployFailed' : 'gitApp.statusWaiting')}
                  </span>
                  {stg.status === 'completed' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 stroke-[3]" />
                  ) : stg.status === 'running' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--foreground)]" />
                  ) : stg.status === 'failed' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-[var(--border)]" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Right Column (8 cols): Wide Live Terminal Console */}
        <div className="lg:col-span-8 rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--card)] dark:bg-[#0a0e17] shadow-xl">
          <div className="px-4 py-2.5 bg-[var(--muted)]/70 dark:bg-[#101726] border-b border-[var(--border)] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
              </div>
              <span className="text-[11px] font-mono text-[var(--muted-foreground)] dark:text-zinc-400 flex items-center gap-1.5 ml-2">
                <Terminal className="w-3.5 h-3.5" /> build-pipeline.log — {server.name} (<span className="sensitive">{server.host}</span>)
              </span>
            </div>

            <button
              type="button"
              onClick={copyLogText}
              className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] dark:text-zinc-400 dark:hover:text-white flex items-center gap-1.5 px-2.5 py-1 rounded hover:bg-[var(--muted)] dark:hover:bg-zinc-800 transition"
            >
              {copiedLog ? <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLog ? t('gitApp.copiedLog') : t('gitApp.copyLog')}</span>
            </button>
          </div>

          <div
            ref={terminalRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
            className="p-5 font-mono text-xs leading-relaxed text-[var(--foreground)]/90 dark:text-slate-300 min-h-[420px] max-h-[540px] overflow-y-auto space-y-1.5 select-text bg-[var(--card)] dark:bg-[#0a0e17]"
          >
            {currentSvc?.status === 'waiting' && logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[360px] text-center p-6 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)] shadow-md">
                  <Clock className="w-7 h-7 text-amber-500 dark:text-amber-400 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center justify-center gap-2">
                    <span>Package Queued for Deployment</span>
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400 font-mono">In Queue</Badge>
                  </h4>
                  <p className="text-xs text-[var(--muted-foreground)] max-w-md leading-relaxed">
                    <span className="font-mono text-[var(--foreground)] font-semibold">{currentAppName}</span> ({currentSvc?.rootDir}) {t('gitApp.queuedDesc')}
                  </p>
                </div>
                {onRetryService && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onRetryService(currentSvc.id)}
                    className="mt-2 text-xs border-[var(--border)] hover:bg-[var(--muted)] text-[var(--foreground)] gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    {t('gitApp.deployNow')}
                  </Button>
                )}
              </div>
            ) : (
              logs.map((log, index) => {
                const line = stripAnsi(log);
                const tone = /\b(error|err!|failed|fatal|exception|eaddrinuse)\b/i.test(line)
                  ? 'text-red-600 dark:text-red-400 font-medium'
                  : /\bwarn(ing)?\b/i.test(line)
                  ? 'text-amber-600 dark:text-yellow-400 font-medium'
                  : '';
                return (
                  <div key={index} className={`whitespace-pre-wrap break-all ${tone}`}>
                    {line}
                  </div>
                );
              })
            )}

            {currentTask?.status === 'running' && (
              <div className="flex items-center gap-2 text-[var(--muted-foreground)] dark:text-zinc-500 animate-pulse pt-2">
                <span className="inline-block w-2 h-4 bg-emerald-500 dark:bg-emerald-400" />
                <span>{t('gitApp.executingStep')} ({currentAppName})</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
