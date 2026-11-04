import React, { useEffect, useMemo, useState } from 'react';
import { cacheGet, cacheSet } from '@/shared/lib/cache';
import {
  RefreshCw, Play, Square, RotateCw, Pause, Trash2, ScrollText, Terminal as TermIcon, Info, ChevronDown, ChevronRight,
  Box, HardDrive, Layers, Download, X, FolderOpen, AlertTriangle
} from 'lucide-react';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { fetchDocker, inspectDocker, dockerContainerAction, dockerComposeAction, dockerPrune, dockerRemoveImage, DockerOverview, DockerContainer, DockerInspect } from '@/features/docker/api';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Skeleton, RowsSkeleton } from '@/shared/ui/skeleton';
import { useT } from '@/shared/i18n';

interface DockerPanelProps {
  serverId: string;
  serverHost: string;
  onLogs: (containerName: string) => void;
  onShell: (command: string) => void;
  onOpenFolder: (path: string) => void;
}

type View = 'containers' | 'images' | 'disk';

const stateColor = (c: DockerContainer) =>
  c.health === 'unhealthy' ? 'bg-amber-500' : c.state === 'running' ? 'bg-emerald-500' : c.state === 'paused' ? 'bg-sky-500' : c.state === 'restarting' ? 'bg-amber-500 animate-pulse' : 'bg-red-500';

const barColor = (v: number) => (v >= 90 ? 'bg-red-500' : v >= 70 ? 'bg-amber-400' : 'bg-emerald-500');

// Only public host bindings become links (127.0.0.1 binds aren't reachable from the browser).
const hostPorts = (ports: string) =>
  [...new Set([...ports.matchAll(/(?:0\.0\.0\.0|\[::\]):(\d+)->/g)].map((m) => m[1]))];

export default function DockerPanel({ serverId, serverHost, onLogs, onShell, onOpenFolder }: DockerPanelProps) {
  const t = useT();
  const cacheKey = `docker:${serverId}`;
  const [data, setData] = useState<DockerOverview | null>(() => cacheGet<DockerOverview>(cacheKey) ?? null);
  const [loading, setLoading] = useState(() => !cacheGet(cacheKey));
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('containers');
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | 'running' | 'stopped' | 'unhealthy'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [output, setOutput] = useState<{ title: string; text: string; ok: boolean } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [inspect, setInspect] = useState<DockerInspect | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const d = await fetchDocker(serverId);
      cacheSet(cacheKey, d);
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Cached data is already on screen: refresh quietly instead of showing the spinner.
  useEffect(() => { load(!!cacheGet(cacheKey)); }, [serverId]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => !document.hidden && load(true), 10000);
    return () => clearInterval(t);
  }, [autoRefresh, serverId]);

  // One runner for every mutating action: confirm, show progress, capture output, refresh.
  const run = async (key: string, title: string, fn: () => Promise<string>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(key);
    try {
      const text = await fn();
      setOutput({ title, text: text || 'OK', ok: true });
      await load(true);
    } catch (e: any) {
      setOutput({ title, text: e.message, ok: false });
    } finally {
      setBusy(null);
    }
  };

  const act = (c: DockerContainer, action: string, confirm?: string) =>
    run(`${c.id}:${action}`, `${action} ${c.name}`, () => dockerContainerAction(serverId, c.id, action), confirm);

  const compose = (project: string, dir: string, files: string, action: string, confirm?: string) =>
    run(`compose:${project}:${action}`, `compose ${action} · ${project}`, () => dockerComposeAction(serverId, project, dir, action, files), confirm);

  const openInspect = async (c: DockerContainer) => {
    try { setInspect(await inspectDocker(serverId, c.id)); } catch (e: any) { setOutput({ title: `inspect ${c.name}`, text: e.message, ok: false }); }
  };

  const containers = data?.containers || [];
  const q = query.toLowerCase();
  const filtered = containers.filter((c) => {
    if (q && !`${c.name} ${c.image} ${c.project} ${c.ports}`.toLowerCase().includes(q)) return false;
    if (stateFilter === 'running') return c.state === 'running';
    if (stateFilter === 'stopped') return c.state !== 'running';
    if (stateFilter === 'unhealthy') return c.health === 'unhealthy' || c.state === 'restarting' || c.state === 'exited';
    return true;
  });

  // Group by compose project; standalone containers go last.
  const groups = useMemo(() => {
    const m = new Map<string, DockerContainer[]>();
    for (const c of filtered) {
      const k = c.project || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    return [...m.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [filtered]);

  const running = containers.filter((c) => c.state === 'running').length;
  const unhealthy = containers.filter((c) => c.health === 'unhealthy' || c.state === 'restarting').length;
  const totalCpu = containers.reduce((s, c) => s + (c.cpu || 0), 0);

  if (loading && !data) {
    return (
      <div role="status" aria-label="Membaca Docker…" className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
        <RowsSkeleton rows={6} className="p-0" />
      </div>
    );
  }
  if (error && !data) return <p role="alert" className="text-xs text-red-500 p-4">{error}</p>;
  if (data && !data.installed) {
    return (
      <div className="py-16 text-center text-xs text-[var(--muted-foreground)] space-y-1">
        <Box className="w-8 h-8 mx-auto opacity-30" />
        <p className="font-semibold">{t('docker.notInstalled')}</p>
      </div>
    );
  }

  const ActionBtn = ({ k, title, onClick, children, danger }: { k: string; title: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) => (
    <Button
      variant="ghost" size="icon" title={title} aria-label={title} onClick={onClick} disabled={!!busy}
      className={`h-6 w-6 ${danger ? 'hover:text-red-500' : ''}`}
    >
      {busy === k ? <RefreshCw className="w-3 h-3 animate-spin" /> : children}
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          [t('docker.containers'), `${running}/${containers.length}`, 'running'],
          [t('docker.unhealthy'), String(unhealthy), unhealthy ? 'unhealthy / restarting' : 'healthy'],
          ['Total CPU', `${totalCpu.toFixed(1)}%`, 'all containers'],
          ['Docker', `v${data?.version}`, `compose ${data?.composeVersion || '–'}`]
        ].map(([label, value, sub], i) => (
          <div key={label} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]">
            <div className="text-[11px] text-[var(--muted-foreground)]">{label}</div>
            <div className={`text-xl font-bold font-mono ${i === 1 && unhealthy ? 'text-amber-500' : ''}`}>{value}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">{sub}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-[var(--border)]" role="tablist">
          {([['containers', t('docker.containers'), Box], ['images', t('docker.images', { count: data?.images.length || 0 }), Layers], ['disk', t('docker.disk'), HardDrive]] as const).map(([v, label, Icon]) => (
            <button
              key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`px-2.5 py-1 text-[11px] flex items-center gap-1 ${view === v ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
            >
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
        </div>
        {view === 'containers' && (
          <>
            <Input placeholder={t('docker.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} className="h-7 w-56 text-xs" />
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)} aria-label={t('docker.filterStatus')}
              className="h-7 text-[11px] bg-[var(--background)] border border-[var(--border)] rounded px-1.5">
              <option value="all">{t('docker.all')}</option>
              <option value="running">{t('docker.running')}</option>
              <option value="stopped">{t('docker.stopped')}</option>
              <option value="unhealthy">{t('docker.unhealthy')}</option>
            </select>
          </>
        )}
        <label className="ml-auto flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> {t('docker.autoRefresh')}
        </label>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('common.refresh')}
        </Button>
      </div>

      {output && (
        <div className={`p-3 rounded-lg border text-xs relative ${output.ok ? 'border-[var(--border)] bg-[var(--card)]' : 'border-red-500/30 bg-red-500/10'}`}>
          <button onClick={() => setOutput(null)} className="absolute right-2 top-2" aria-label="Tutup output"><X className="w-3.5 h-3.5" /></button>
          <div className={`font-semibold mb-1 ${output.ok ? '' : 'text-red-500'}`}>{output.title}</div>
          <pre className="whitespace-pre-wrap font-mono text-[11px] max-h-60 overflow-auto">{output.text}</pre>
        </div>
      )}

      {/* CONTAINERS */}
      {view === 'containers' && (
        <div className="space-y-3">
          {groups.length === 0 && <p className="text-xs text-[var(--muted-foreground)] text-center py-10">{t('docker.emptyContainers')}</p>}
          {groups.map(([project, list]) => {
            const dir = list[0]?.workingDir || '';
            const files = list[0]?.configFiles || '';
            const isOpen = !collapsed.has(project);
            const up = list.filter((c) => c.state === 'running').length;
            return (
              <div key={project || '_standalone'} className="border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[var(--muted)]">
                  <button
                    className="flex items-center gap-1.5 text-xs font-semibold"
                    aria-expanded={isOpen}
                    onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(project) ? n.delete(project) : n.add(project); return n; })}
                  >
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    {project ? <>🐳 {project}</> : 'Standalone containers'}
                    <span className="font-normal text-[var(--muted-foreground)]">({up}/{list.length} running)</span>
                  </button>
                  {dir && (
                    <span className="text-[10px] font-mono text-[var(--muted-foreground)] truncate sensitive" title={files}>
                      {files ? files.split(',').map((f) => f.split('/').pop()).join(', ') : dir}
                    </span>
                  )}
                  {project && dir && (
                    <div className="ml-auto flex flex-wrap items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => onOpenFolder(dir)} title="Buka folder project">
                        <FolderOpen className="w-3 h-3" /> Files
                      </Button>
                      {([
                        ['restart', 'Restart', RotateCw, `Restart semua container di ${project}?`],
                        ['pull-up', 'Pull & Up', Download, `Pull image terbaru lalu recreate container di ${project}? (deploy)`],
                        ['up', 'Up', Play, undefined],
                        ['stop', 'Stop', Square, `Stop semua container di ${project}?`]
                      ] as const).map(([a, label, Icon, confirm]) => (
                        <Button
                          key={a} variant="outline" size="sm" className="h-6 text-[10px] gap-1" disabled={!!busy}
                          onClick={() => compose(project, dir, files, a, confirm)}
                        >
                          {busy === `compose:${project}:${a}` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />} {label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-[10px] text-[var(--muted-foreground)] text-left">
                        <tr className="border-b border-[var(--border)]">
                          <th className="py-1.5 px-3">CONTAINER</th>
                          <th className="py-1.5 px-3">STATUS</th>
                          <th className="py-1.5 px-3 w-28">CPU</th>
                          <th className="py-1.5 px-3 w-36">MEMORY</th>
                          <th className="py-1.5 px-3">PORTS</th>
                          <th className="py-1.5 px-3 text-right">AKSI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {list.map((c) => {
                          const isRunning = c.state === 'running';
                          const links = hostPorts(c.ports);
                          return (
                            <tr key={c.id} className="hover:bg-[var(--muted)]/40">
                              <td className="py-1.5 px-3">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${stateColor(c)}`} aria-hidden />
                                  <div className="min-w-0">
                                    <div className="font-semibold font-mono truncate">{c.name}</div>
                                    <div className="text-[10px] text-[var(--muted-foreground)] font-mono truncate max-w-xs flex items-center gap-1" title={c.image}><BrandIcon name={c.image} className="w-3 h-3" />{c.image}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-1.5 px-3 whitespace-nowrap">
                                <span className={c.health === 'unhealthy' ? 'text-amber-500 font-semibold' : isRunning ? '' : 'text-red-500'}>
                                  {c.health === 'unhealthy' && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                                  {c.status}
                                </span>
                              </td>
                              <td className="py-1.5 px-3">
                                {c.cpu != null && isRunning ? (
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1 h-1.5 rounded bg-[var(--muted)] overflow-hidden">
                                      <div className={`h-full ${barColor(c.cpu)}`} style={{ width: `${Math.min(100, c.cpu)}%` }} />
                                    </div>
                                    <span className="font-mono text-[10px] w-10 text-right">{c.cpu.toFixed(1)}%</span>
                                  </div>
                                ) : <span className="text-[var(--muted-foreground)]">–</span>}
                              </td>
                              <td className="py-1.5 px-3">
                                {c.memUsage && isRunning ? (
                                  <div title={c.memUsage}>
                                    <div className="h-1.5 rounded bg-[var(--muted)] overflow-hidden">
                                      <div className={`h-full ${barColor(c.memPercent || 0)}`} style={{ width: `${Math.min(100, c.memPercent || 0)}%` }} />
                                    </div>
                                    <span className="font-mono text-[10px] text-[var(--muted-foreground)]">{c.memUsage.split(' / ')[0]}</span>
                                  </div>
                                ) : <span className="text-[var(--muted-foreground)]">–</span>}
                              </td>
                              <td className="py-1.5 px-3 font-mono text-[10px]">
                                {links.length ? (
                                  <div className="flex flex-wrap gap-1">
                                    {links.map((p) => (
                                      <a key={p} href={`http://${serverHost}:${p}`} target="_blank" rel="noopener noreferrer"
                                        className="px-1.5 rounded bg-[var(--muted)] border border-[var(--border)] hover:underline">:{p}</a>
                                    ))}
                                  </div>
                                ) : <span className="text-[var(--muted-foreground)]" title={c.ports}>{c.ports ? 'internal' : '–'}</span>}
                              </td>
                              <td className="py-1.5 px-3 text-right whitespace-nowrap">
                                <ActionBtn k={`${c.id}:logs`} title="Logs" onClick={() => onLogs(c.name)}><ScrollText className="w-3 h-3" /></ActionBtn>
                                {isRunning && (
                                  <ActionBtn k={`${c.id}:shell`} title="Shell ke container" onClick={() => onShell(`docker exec -it ${c.name} sh -c 'command -v bash >/dev/null && exec bash || exec sh'`)}>
                                    <TermIcon className="w-3 h-3" />
                                  </ActionBtn>
                                )}
                                <ActionBtn k={`${c.id}:inspect`} title="Inspect" onClick={() => openInspect(c)}><Info className="w-3 h-3" /></ActionBtn>
                                <ActionBtn k={`${c.id}:restart`} title="Restart" onClick={() => act(c, 'restart')}><RotateCw className="w-3 h-3" /></ActionBtn>
                                {c.state === 'paused' ? (
                                  <ActionBtn k={`${c.id}:unpause`} title="Unpause" onClick={() => act(c, 'unpause')}><Play className="w-3 h-3" /></ActionBtn>
                                ) : isRunning ? (
                                  <>
                                    <ActionBtn k={`${c.id}:pause`} title="Pause" onClick={() => act(c, 'pause')}><Pause className="w-3 h-3" /></ActionBtn>
                                    <ActionBtn k={`${c.id}:stop`} title="Stop" danger onClick={() => act(c, 'stop', `Stop container ${c.name}?`)}><Square className="w-3 h-3" /></ActionBtn>
                                  </>
                                ) : (
                                  <>
                                    <ActionBtn k={`${c.id}:start`} title="Start" onClick={() => act(c, 'start')}><Play className="w-3 h-3" /></ActionBtn>
                                    <ActionBtn k={`${c.id}:rm`} title="Hapus container" danger
                                      onClick={() => act(c, 'rm', `Hapus container ${c.name}? Data di dalam container (bukan volume) akan hilang.`)}>
                                      <Trash2 className="w-3 h-3" />
                                    </ActionBtn>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* IMAGES */}
      {view === 'images' && (
        <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-[var(--muted)] text-[10px] text-[var(--muted-foreground)] text-left">
              <tr>
                <th className="py-2 px-3">REPOSITORY</th>
                <th className="py-2 px-3">TAG</th>
                <th className="py-2 px-3 text-right">SIZE</th>
                <th className="py-2 px-3">DIBUAT</th>
                <th className="py-2 px-3">STATUS</th>
                <th className="py-2 px-3 text-right">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] font-mono">
              {data?.images.map((img) => {
                const ref = img.repo === '<none>' ? img.id : `${img.repo}:${img.tag}`;
                return (
                  <tr key={img.id + img.tag}>
                    <td className="py-1.5 px-3 max-w-sm truncate" title={img.repo}><span className="inline-flex items-center gap-1.5"><BrandIcon name={img.repo} className="w-3.5 h-3.5" />{img.repo}</span></td>
                    <td className="py-1.5 px-3 text-[var(--muted-foreground)]">{img.tag}</td>
                    <td className="py-1.5 px-3 text-right">{img.size}</td>
                    <td className="py-1.5 px-3 text-[var(--muted-foreground)] font-sans">{img.createdSince}</td>
                    <td className="py-1.5 px-3 font-sans">
                      {img.inUse ? <span className="text-emerald-600">dipakai</span> : <span className="text-[var(--muted-foreground)]">tidak dipakai</span>}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      {!img.inUse && (
                        <ActionBtn k={`img:${img.id}`} title="Hapus image" danger
                          onClick={() => run(`img:${img.id}`, `rmi ${ref}`, () => dockerRemoveImage(serverId, ref), `Hapus image ${ref}?`)}>
                          <Trash2 className="w-3 h-3" />
                        </ActionBtn>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* DISK */}
      {view === 'disk' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data?.df.map((d) => (
              <div key={d.type} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]">
                <div className="text-[11px] text-[var(--muted-foreground)]">{d.type}</div>
                <div className="text-lg font-bold font-mono">{d.size}</div>
                <div className="text-[10px] text-[var(--muted-foreground)]">{d.active}/{d.total} aktif</div>
                <div className={`text-[11px] mt-1 font-mono ${d.reclaimable.startsWith('0B') ? 'text-[var(--muted-foreground)]' : 'text-amber-600 font-semibold'}`}>
                  Bisa dibersihkan: {d.reclaimable}
                </div>
              </div>
            ))}
          </div>
          <div className="border border-[var(--border)] rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-semibold">Bersihkan</h4>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Hanya menghapus yang <b>tidak dipakai</b> container mana pun. Volume berisi data database, jadi prune volume diberi peringatan keras.
            </p>
            <div className="flex flex-wrap gap-2">
              {([
                ['build-cache', 'Build cache', 'Hapus semua build cache? Aman, build berikutnya cuma lebih lama.'],
                ['dangling-images', 'Image tanpa tag', 'Hapus image dangling (<none>)?'],
                ['images', 'Image tidak dipakai', 'Hapus SEMUA image yang tidak dipakai container mana pun?'],
                ['containers', 'Container berhenti', 'Hapus semua container yang sedang berhenti?'],
                ['networks', 'Network tidak dipakai', 'Hapus network yang tidak dipakai?'],
                ['volumes', '⚠ Volume tidak dipakai', 'PERINGATAN: volume yang tidak terpasang di container mana pun akan DIHAPUS PERMANEN, termasuk data database lama. Lanjutkan?']
              ] as const).map(([what, label, confirm]) => (
                <Button
                  key={what} variant={what === 'volumes' ? 'destructive' : 'outline'} size="sm" className="gap-1" disabled={!!busy}
                  onClick={() => run(`prune:${what}`, `prune ${what}`, () => dockerPrune(serverId, what), confirm)}
                >
                  {busy === `prune:${what}` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* INSPECT DRAWER */}
      {inspect && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex justify-end" onClick={() => setInspect(null)}>
          <div
            className="w-full max-w-xl h-full bg-[var(--card)] text-[var(--foreground)] border-l border-[var(--border)] overflow-auto p-4 space-y-4 text-xs"
            onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Inspect ${inspect.name}`}
          >
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm font-mono flex-1 truncate">{inspect.name}</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setInspect(null)} aria-label="Tutup"><X className="w-4 h-4" /></Button>
            </div>
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1">
              {([
                ['Image', inspect.image], ['Status', `${inspect.status}${inspect.health ? ` (${inspect.health})` : ''}`],
                ['Exit code', String(inspect.exitCode)], ['OOM killed', inspect.oomKilled ? 'YA' : 'tidak'],
                ['Restart', `${inspect.restartCount}x · policy ${inspect.restartPolicy || 'no'}`],
                ['Mulai', inspect.startedAt ? new Date(inspect.startedAt).toLocaleString() : '–'], ['Command', inspect.cmd]
              ] as const).map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="text-[var(--muted-foreground)]">{k}</dt>
                  <dd className={`font-mono break-all ${k === 'OOM killed' && v === 'YA' ? 'text-red-500' : ''}`}>{v}</dd>
                </React.Fragment>
              ))}
            </dl>
            {([
              ['Ports', inspect.ports.map((p) => `${p.container} → ${p.host || '(internal)'}`)],
              ['Networks', inspect.networks.map((n) => `${n.name} · ${n.ip || '–'}`)],
              ['Mounts', inspect.mounts.map((m) => `${m.type} ${m.source} → ${m.destination}${m.rw ? '' : ' (ro)'}`)]
            ] as const).map(([title, rows]) => (
              <section key={title}>
                <h4 className="font-semibold mb-1">{title}</h4>
                {rows.length ? <ul className="font-mono space-y-0.5 break-all sensitive">{rows.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="text-[var(--muted-foreground)]">–</p>}
              </section>
            ))}
            <section>
              <div className="flex items-center mb-1">
                <h4 className="font-semibold flex-1">Environment ({inspect.env.length})</h4>
                <span className="text-[10px] text-[var(--muted-foreground)]">nilai rahasia (password/key/token) disembunyikan server</span>
              </div>
              <ul className="font-mono space-y-0.5 break-all">
                {inspect.env.map((e) => (
                  <li key={e.key}>
                    <span className="text-sky-600">{e.key}</span>=<span className={e.masked ? 'text-[var(--muted-foreground)]' : ''}>{e.value}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
