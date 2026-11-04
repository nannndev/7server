import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  Activity,
  Layers,
  Box,
  AlertTriangle,
  Play,
  Square,
  RotateCw,
  Search,
  CheckCircle2,
  XCircle,
  Skull,
  ScrollText
} from 'lucide-react';
import { LogsModal } from '@/features/logs';
import { fetchProcesses, fetchServices, killProcess, controlService } from '@/features/processes/api';
import { controlDocker } from '@/features/docker';
import { ServerItem } from '@/features/servers';
import { ProcessInfo, SystemService, DockerContainerInfo } from '@/features/processes/types';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { RowsSkeleton } from '@/shared/ui/skeleton';

interface ProcessServiceModalProps {
  server: ServerItem;
  onClose: () => void;
}

export default function ProcessServiceModal({ server, onClose }: ProcessServiceModalProps) {
  const [activeTab, setActiveTab] = useState<'processes' | 'services' | 'docker'>('processes');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [services, setServices] = useState<SystemService[]>([]);
  const [dockerContainers, setDockerContainers] = useState<DockerContainerInfo[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'running' | 'failed'>('all');
  const [logsTarget, setLogsTarget] = useState<{ type: 'service' | 'docker'; name: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'processes') {
        const procData = await fetchProcesses(server.id);
        setProcesses(procData);
      } else {
        const srvData = await fetchServices(server.id);
        setServices(srvData.services || []);
        setDockerContainers(srvData.dockerContainers || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [server.id, activeTab]);

  const handleKillProcess = async (pid: number, comm: string) => {
    if (!window.confirm(`Yakin ingin mematikan (kill) proses ${comm} (PID: ${pid})?`)) return;
    try {
      await killProcess(server.id, pid, 'kill');
      setActionMessage(`Proses ${comm} (PID: ${pid}) berhasil di-kill.`);
      setTimeout(() => setActionMessage(null), 3500);
      loadData();
    } catch (err: any) {
      alert(`Gagal mematikan proses: ${err.message}`);
    }
  };

  const handleServiceControl = async (serviceName: string, action: string) => {
    try {
      setActionMessage(`Menjalankan '${action}' pada ${serviceName}...`);
      await controlService(server.id, serviceName, action);
      setActionMessage(`Service ${serviceName} berhasil di-${action}.`);
      setTimeout(() => setActionMessage(null), 3500);
      loadData();
    } catch (err: any) {
      alert(`Gagal mengontrol service: ${err.message}`);
      setActionMessage(null);
    }
  };

  const handleDockerControl = async (containerId: string, name: string, action: string) => {
    try {
      setActionMessage(`Menjalankan '${action}' pada container ${name}...`);
      await controlDocker(server.id, containerId, action);
      setActionMessage(`Container ${name} berhasil di-${action}.`);
      setTimeout(() => setActionMessage(null), 3500);
      loadData();
    } catch (err: any) {
      alert(`Gagal mengontrol container: ${err.message}`);
      setActionMessage(null);
    }
  };

  const filteredProcesses = processes.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.comm?.toLowerCase().includes(q) ||
      p.user?.toLowerCase().includes(q) ||
      String(p.pid).includes(q) ||
      p.args?.toLowerCase().includes(q)
    );
  });

  const filteredServices = services.filter((s) => {
    const matchesSearch =
      s.unit?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (serviceFilter === 'running') return s.active === 'active';
    if (serviceFilter === 'failed') return s.active === 'failed';
    return true;
  });

  const filteredDocker = dockerContainers.filter((d) => {
    return (
      d.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.image?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.id?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-zinc-100">{server.name}</span>
              <span className="text-[11px] text-zinc-500 font-mono sensitive">({server.host})</span>
            </div>
            <p className="text-[11px] text-zinc-500">Running Processes, Systemd Services & Containers</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {actionMessage && (
          <div className="bg-zinc-900 border-b border-zinc-800 text-zinc-200 px-4 py-1.5 text-xs font-mono">
            {actionMessage}
          </div>
        )}

        {/* Tab & Controls */}
        <div className="px-5 py-2.5 border-b border-zinc-800/80 bg-zinc-950/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-0.5 bg-zinc-950 rounded-lg border border-zinc-800">
            <button
              onClick={() => { setActiveTab('processes'); setSearchQuery(''); }}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition ${
                activeTab === 'processes'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-zinc-400" />
              Processes ({processes.length})
            </button>
            <button
              onClick={() => { setActiveTab('services'); setSearchQuery(''); }}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition ${
                activeTab === 'services'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-zinc-400" />
              Services ({services.length})
            </button>
            <button
              onClick={() => { setActiveTab('docker'); setSearchQuery(''); }}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition ${
                activeTab === 'docker'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Box className="w-3.5 h-3.5 text-zinc-400" />
              Docker ({dockerContainers.length})
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-sm ml-auto">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                type="text"
                placeholder={`Search ${activeTab}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-zinc-950 border-zinc-800"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={loadData}
              disabled={loading}
              className="h-8 w-8 text-zinc-400 hover:text-zinc-100 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto p-4 bg-zinc-900">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2 font-mono">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && !error && (
            <RowsSkeleton rows={8} />
          )}

          {/* PROCESSES */}
          {!loading && !error && activeTab === 'processes' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-[11px] font-medium">
                    <th className="py-2 px-3">PID</th>
                    <th className="py-2 px-3">USER</th>
                    <th className="py-2 px-3">% CPU</th>
                    <th className="py-2 px-3">% MEM</th>
                    <th className="py-2 px-3">COMMAND</th>
                    <th className="py-2 px-3 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50 font-mono text-xs">
                  {filteredProcesses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-zinc-500">
                        No processes match filter
                      </td>
                    </tr>
                  ) : (
                    filteredProcesses.map((p) => (
                      <tr key={p.pid} className="hover:bg-zinc-900/60 transition">
                        <td className="py-2 px-3 text-zinc-400">{p.pid}</td>
                        <td className="py-2 px-3 text-zinc-300">{p.user}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              p.cpu > 50
                                ? 'bg-red-500/20 text-red-400'
                                : p.cpu > 20
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'text-zinc-300'
                            }`}
                          >
                            {p.cpu}%
                          </span>
                        </td>
                        <td className="py-2 px-3 text-zinc-400">{p.mem}%</td>
                        <td className="py-2 px-3 max-w-md truncate text-zinc-300" title={p.args || p.comm}>
                          <span className="font-semibold text-zinc-100">{p.comm}</span>{' '}
                          <span className="text-zinc-500 text-[11px]">{p.args}</span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleKillProcess(p.pid, p.comm)}
                            className="h-6 px-2 text-[10px] gap-1"
                          >
                            <Skull className="w-3 h-3" />
                            Kill
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* SERVICES */}
          {!loading && !error && activeTab === 'services' && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 pb-1">
                <span className="text-[11px] text-zinc-500">Filter:</span>
                {(['all', 'running', 'failed'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setServiceFilter(st)}
                    className={`px-2 py-0.5 rounded text-[11px] capitalize transition ${
                      serviceFilter === st
                        ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 text-[11px] font-medium">
                      <th className="py-2 px-3">UNIT</th>
                      <th className="py-2 px-3">STATUS</th>
                      <th className="py-2 px-3">SUB</th>
                      <th className="py-2 px-3">DESCRIPTION</th>
                      <th className="py-2 px-3 text-right">CONTROL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {filteredServices.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-10 text-zinc-500">
                          No services match filter
                        </td>
                      </tr>
                    ) : (
                      filteredServices.map((s) => (
                        <tr key={s.unit} className="hover:bg-zinc-900/60 transition">
                          <td className="py-2 px-3 font-mono text-zinc-200">{s.unit}</td>
                          <td className="py-2 px-3">
                            <Badge
                              variant={s.active === 'active' ? 'success' : s.active === 'failed' ? 'destructive' : 'secondary'}
                              className="text-[10px] py-0 px-1.5 h-4 gap-1"
                            >
                              {s.active === 'active' ? (
                                <CheckCircle2 className="w-2.5 h-2.5" />
                              ) : (
                                <XCircle className="w-2.5 h-2.5" />
                              )}
                              {s.active}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-zinc-500 font-mono text-[11px]">{s.sub}</td>
                          <td className="py-2 px-3 text-zinc-400 max-w-sm truncate" title={s.description}>
                            {s.description}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setLogsTarget({ type: 'service', name: s.unit })}
                                className="h-6 w-6 text-zinc-400 hover:text-zinc-100"
                                title="Logs"
                              >
                                <ScrollText className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleServiceControl(s.unit, 'restart')}
                                className="h-6 w-6 text-zinc-400 hover:text-zinc-100"
                                title="Restart"
                              >
                                <RotateCw className="w-3 h-3" />
                              </Button>
                              {s.active === 'active' ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleServiceControl(s.unit, 'stop')}
                                  className="h-6 w-6 text-zinc-400 hover:text-red-400"
                                  title="Stop"
                                >
                                  <Square className="w-3 h-3" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleServiceControl(s.unit, 'start')}
                                  className="h-6 w-6 text-zinc-400 hover:text-emerald-400"
                                  title="Start"
                                >
                                  <Play className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DOCKER */}
          {!loading && !error && activeTab === 'docker' && (
            <div>
              {dockerContainers.length === 0 ? (
                <div className="text-center py-16 text-zinc-500 space-y-1">
                  <Box className="w-7 h-7 mx-auto opacity-30" />
                  <p className="text-xs">No active Docker containers or Docker is not installed.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400 text-[11px] font-medium">
                        <th className="py-2 px-3">NAME</th>
                        <th className="py-2 px-3">ID</th>
                        <th className="py-2 px-3">IMAGE</th>
                        <th className="py-2 px-3">STATUS</th>
                        <th className="py-2 px-3 text-right">CONTROL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50 font-mono text-xs">
                      {filteredDocker.map((c) => (
                        <tr key={c.id} className="hover:bg-zinc-900/60 transition">
                          <td className="py-2 px-3 font-semibold text-zinc-200">{c.name}</td>
                          <td className="py-2 px-3 text-zinc-500 text-[11px]">{c.id}</td>
                          <td className="py-2 px-3 text-zinc-400 text-[11px]">{c.image}</td>
                          <td className="py-2 px-3">
                            <Badge
                              variant={c.state === 'running' ? 'success' : 'destructive'}
                              className="text-[10px] py-0 px-1.5 h-4"
                            >
                              {c.status}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setLogsTarget({ type: 'docker', name: c.name })}
                                className="h-6 w-6 text-zinc-400 hover:text-zinc-100"
                                title="Logs"
                              >
                                <ScrollText className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDockerControl(c.id, c.name, 'restart')}
                                className="h-6 w-6 text-zinc-400 hover:text-zinc-100"
                              >
                                <RotateCw className="w-3 h-3" />
                              </Button>
                              {c.state === 'running' ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDockerControl(c.id, c.name, 'stop')}
                                  className="h-6 w-6 text-zinc-400 hover:text-red-400"
                                >
                                  <Square className="w-3 h-3" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDockerControl(c.id, c.name, 'start')}
                                  className="h-6 w-6 text-zinc-400 hover:text-emerald-400"
                                >
                                  <Play className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {logsTarget && (
        <LogsModal serverId={server.id} type={logsTarget.type} name={logsTarget.name} onClose={() => setLogsTarget(null)} />
      )}
    </div>
  );
}
