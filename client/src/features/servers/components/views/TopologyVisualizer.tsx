import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Network,
  Globe,
  Server,
  Zap,
  Layers,
  Radio,
  RefreshCw,
  ExternalLink,
  RotateCcw,
  Box,
  Activity,
  Terminal as TermIcon,
  ZoomIn,
  ZoomOut,
  Database,
  ShieldCheck,
  ShieldAlert,
  Search,
  FolderOpen,
  FileCode,
  Sliders,
  X,
  LayoutGrid,
  GitFork,
  CheckCircle2,
  AlertCircle,
  Play,
  ArrowRight,
  HardDrive
} from 'lucide-react';
import { ServerItem } from '@/features/servers/types';
import { WebAppInfo, ListeningPortInfo, fetchWebApps, fetchListeningPorts } from '@/features/webapps';
import { Pm2ProcessInfo, SupervisorProcessInfo, fetchPm2AndSupervisor } from '@/features/processes';
import { fetchDocker, DockerContainer } from '@/features/docker/api';
import { fetchCertificates, CertificateItem } from '@/features/servers/api';
import { discoverDbs, DiscoveredDb } from '@/features/databases/api';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { useT } from '@/shared/i18n';

export interface TopologyVisualizerProps {
  servers: ServerItem[];
  focusedServer?: ServerItem | null;
  onSelectServer?: (server: ServerItem) => void;
  onOpenTerminal?: (server: ServerItem) => void;
  onOpenFiles?: (path?: string) => void;
  onOpenLogs?: (target: { type: 'service' | 'docker' | 'pm2' | 'supervisor'; name: string }) => void;
  onNavigateTab?: (tab: any) => void;
}

export type NodeCategory = 'hub' | 'server' | 'ingress' | 'nginx' | 'webapp' | 'docker' | 'pm2' | 'database' | 'port';

export interface GraphNode {
  id: string;
  label: string;
  sub: string;
  category: NodeCategory;
  tier: 1 | 2 | 3 | 4; // 1: Ingress/Domain, 2: Gateway/Nginx, 3: Apps/Containers, 4: Data/Ports
  x: number;
  y: number;
  color: string;
  status?: string;
  isOnline?: boolean;
  port?: string | number;
  process?: string;
  pid?: string | number;
  path?: string;
  url?: string;
  image?: string;
  memory?: string;
  cpu?: string;
  serverRef?: ServerItem;
  meta?: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  color: string;
  animated?: boolean;
  label?: string;
}

export default function TopologyVisualizer({
  servers,
  focusedServer,
  onSelectServer,
  onOpenTerminal,
  onOpenFiles,
  onOpenLogs,
  onNavigateTab
}: TopologyVisualizerProps) {
  const t = useT();
  const [activeServerId, setActiveServerId] = useState<string>(
    focusedServer?.id || (servers.length === 1 ? servers[0].id : 'ALL')
  );
  const stageRef = useRef<HTMLDivElement>(null);

  // View modes: 'pipeline' (2D Horizontal Flow), 'matrix' (Dense Service Grid), 'isometric' (3D Tilt)
  const [viewMode, setViewMode] = useState<'pipeline' | 'matrix' | 'isometric'>('pipeline');
  const [tilt, setTilt] = useState({ x: 22, z: -6 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCat, setFilterCat] = useState<'all' | 'ingress' | 'webapp' | 'docker' | 'pm2' | 'database' | 'port'>('all');

  // Server deep data states
  const [loadingNodeData, setLoadingNodeData] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [nodeApps, setNodeApps] = useState<WebAppInfo[]>([]);
  const [nodePm2, setNodePm2] = useState<Pm2ProcessInfo[]>([]);
  const [nodeSup, setNodeSup] = useState<SupervisorProcessInfo[]>([]);
  const [nodePorts, setNodePorts] = useState<ListeningPortInfo[]>([]);
  const [nodeDocker, setNodeDocker] = useState<DockerContainer[]>([]);
  const [nodeCerts, setNodeCerts] = useState<CertificateItem[]>([]);
  const [nodeDbs, setNodeDbs] = useState<DiscoveredDb[]>([]);

  // Selected Node Drawer
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    if (focusedServer) {
      setActiveServerId(focusedServer.id);
    }
  }, [focusedServer?.id]);

  const targetServer = servers.find((s) => s.id === activeServerId) || null;

  // Zoom with trackpad / mousewheel
  useEffect(() => {
    const el = stageRef.current;
    if (!el || viewMode === 'matrix') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      setZoom((z) => Math.min(2.2, Math.max(0.5, +(z + delta).toFixed(2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewMode]);

  const loadDeepTopology = async (srv: ServerItem) => {
    setLoadingNodeData(true);
    try {
      const [appsRes, pm2Res, portsRes, dockerRes, certsRes, dbsRes] = await Promise.allSettled([
        fetchWebApps(srv.id),
        fetchPm2AndSupervisor(srv.id),
        fetchListeningPorts(srv.id),
        fetchDocker(srv.id, false),
        fetchCertificates(srv.id),
        discoverDbs(srv.id)
      ]);

      setNodeApps(appsRes.status === 'fulfilled' ? appsRes.value : []);
      setNodePm2(pm2Res.status === 'fulfilled' ? (pm2Res.value.pm2 || []) : []);
      setNodeSup(pm2Res.status === 'fulfilled' ? (pm2Res.value.supervisor || []) : []);
      setNodePorts(portsRes.status === 'fulfilled' ? (portsRes.value.ports || []) : []);
      setNodeDocker(dockerRes.status === 'fulfilled' && dockerRes.value.installed ? (dockerRes.value.containers || []) : []);
      setNodeCerts(certsRes.status === 'fulfilled' ? certsRes.value : []);
      setNodeDbs(dbsRes.status === 'fulfilled' ? dbsRes.value : []);
    } finally {
      setLoadingNodeData(false);
      setHasLoadedOnce(true);
    }
  };

  useEffect(() => {
    if (targetServer) {
      loadDeepTopology(targetServer);
    }
  }, [targetServer?.id]);

  // Construct DAG Architecture Graph Nodes & Edges (Canvas 1050 x 580)
  const { nodes, edges } = useMemo(() => {
    const n: GraphNode[] = [];
    const e: GraphEdge[] = [];

    if (!targetServer) {
      // FLEET MESH VIEW
      n.push({
        id: 'hub-core',
        label: 'VPS Control Hub',
        sub: `${servers.length} Connected Nodes`,
        category: 'hub',
        tier: 2,
        x: 525,
        y: 290,
        color: '#38bdf8',
        isOnline: true
      });

      const count = servers.length || 1;
      servers.forEach((srv, idx) => {
        const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
        const rx = 280;
        const ry = 175;
        const sx = 525 + Math.cos(angle) * rx;
        const sy = 290 + Math.sin(angle) * ry;
        const online = srv.status === 'online';

        n.push({
          id: `srv-${srv.id}`,
          label: srv.name,
          sub: `${srv.host} · CPU ${srv.metrics?.cpuUsagePercent ?? 0}%`,
          category: 'server',
          tier: 3,
          x: sx,
          y: sy,
          color: online ? '#10b981' : '#ef4444',
          status: srv.status,
          isOnline: online,
          serverRef: srv
        });

        e.push({
          id: `edge-hub-${srv.id}`,
          from: 'hub-core',
          to: `srv-${srv.id}`,
          color: online ? '#10b981' : '#ef4444',
          animated: online
        });
      });

      return { nodes: n, edges: e };
    }

    // SINGLE SERVER DEEP ARCHITECTURE FLOW PIPELINE
    // Layer 1: Ingress / Domains / Public Edge (X = 110)
    // Layer 2: Gateway & Nginx (X = 350)
    // Layer 3: Application Runtime & Containers (X = 650)
    // Layer 4: Data & Listening Ports (X = 930)

    const srvGatewayId = `gw-${targetServer.id}`;

    // LAYER 1: Ingress / Domains
    const ingressItems: { id: string; label: string; sub: string; url?: string; valid?: boolean }[] = [];
    if (nodeCerts && nodeCerts.length > 0) {
      nodeCerts.slice(0, 5).forEach((c, idx) => {
        const dom = c.domains[0] || 'domain.com';
        ingressItems.push({
          id: `ing-cert-${idx}`,
          label: dom,
          sub: `SSL: ${c.isValid ? (c.isExpiringSoon ? 'expiring' : 'valid') : 'invalid'} (${c.daysRemaining}d)`,
          url: `https://${dom}`,
          valid: c.isValid
        });
      });
    } else if (nodeApps.some((a) => a.domain)) {
      nodeApps.filter((a) => a.domain).slice(0, 5).forEach((a, idx) => {
        const first = a.domain!.split(',')[0].trim();
        ingressItems.push({
          id: `ing-app-${idx}`,
          label: first,
          sub: 'Public HTTP/S',
          url: `http://${first}`,
          valid: true
        });
      });
    } else {
      ingressItems.push({
        id: 'ing-default',
        label: `${targetServer.host}`,
        sub: 'Direct Host IP :22 / :80',
        valid: true
      });
    }

    ingressItems.forEach((ing, idx) => {
      const y = 80 + idx * (420 / Math.max(1, ingressItems.length - 1 || 1));
      n.push({
        id: ing.id,
        label: ing.label,
        sub: ing.sub,
        category: 'ingress',
        tier: 1,
        x: 110,
        y: ingressItems.length === 1 ? 280 : y,
        color: ing.valid ? '#38bdf8' : '#f59e0b',
        url: ing.url,
        isOnline: ing.valid
      });

      e.push({
        id: `edge-${ing.id}-${srvGatewayId}`,
        from: ing.id,
        to: srvGatewayId,
        color: '#38bdf8',
        animated: true
      });
    });

    // LAYER 2: Reverse Proxy & Nginx Gateway
    n.push({
      id: srvGatewayId,
      label: 'Nginx Reverse Proxy',
      sub: `${targetServer.name} (:80 / :443)`,
      category: 'nginx',
      tier: 2,
      x: 360,
      y: 280,
      color: '#10b981',
      serverRef: targetServer,
      isOnline: true
    });

    // LAYER 3: Compute & Applications (WebApps, PM2 Workers, Docker Containers)
    const computeNodes: GraphNode[] = [];

    // WebApps
    nodeApps.slice(0, 6).forEach((app) => {
      computeNodes.push({
        id: `app-${app.name}`,
        label: app.name,
        sub: app.type || 'Web Application',
        category: 'webapp',
        tier: 3,
        x: 640,
        y: 0,
        color: app.type.includes('Laravel') ? '#f43f5e' : app.type.includes('Node') ? '#22c55e' : '#38bdf8',
        path: app.path,
        url: app.domain ? `http://${app.domain.split(',')[0].trim()}` : undefined,
        isOnline: true
      });
    });

    // Docker Containers
    nodeDocker.slice(0, 5).forEach((c) => {
      const running = c.state === 'running';
      computeNodes.push({
        id: `doc-${c.id}`,
        label: c.name,
        sub: `Docker · ${c.image.split(':')[0]}`,
        category: 'docker',
        tier: 3,
        x: 640,
        y: 0,
        color: running ? '#06b6d4' : '#64748b',
        image: c.image,
        status: c.status,
        isOnline: running
      });
    });

    // PM2 Workers
    nodePm2.slice(0, 4).forEach((p) => {
      const online = p.status === 'online';
      computeNodes.push({
        id: `pm2-${p.pm_id}`,
        label: `PM2: ${p.name}`,
        sub: `${p.memoryMB}MB · ${p.status}`,
        category: 'pm2',
        tier: 3,
        x: 640,
        y: 0,
        color: online ? '#a78bfa' : '#ef4444',
        memory: `${p.memoryMB}MB`,
        isOnline: online
      });
    });

    // Fallback if no compute detected
    if (computeNodes.length === 0) {
      computeNodes.push({
        id: 'compute-systemd',
        label: 'Systemd & OS Services',
        sub: `${targetServer.metrics?.cpuCores || 1} vCPU · Active Services`,
        category: 'webapp',
        tier: 3,
        x: 640,
        y: 280,
        color: '#10b981',
        isOnline: true
      });
    }

    const totalCompute = computeNodes.length;
    computeNodes.forEach((node, idx) => {
      const y = 60 + idx * (460 / Math.max(1, totalCompute - 1 || 1));
      node.y = totalCompute === 1 ? 280 : y;
      n.push(node);

      e.push({
        id: `edge-${srvGatewayId}-${node.id}`,
        from: srvGatewayId,
        to: node.id,
        color: node.color,
        animated: node.isOnline
      });
    });

    // LAYER 4: Databases & Internal Listening Ports
    const dataNodes: GraphNode[] = [];

    // Discovered Databases
    nodeDbs.forEach((db) => {
      dataNodes.push({
        id: `db-${db.name}-${db.engine}`,
        label: `${db.engine.toUpperCase()} DB`,
        sub: `${db.location.kind === 'container' ? 'Container' : 'Host'} :${db.port || 'default'}`,
        category: 'database',
        tier: 4,
        x: 930,
        y: 0,
        color: '#f59e0b',
        port: db.port,
        isOnline: true
      });
    });

    // Listening Ports
    const uniquePorts = Array.from(new Map(nodePorts.map((p) => [p.port, p])).values())
      .filter((p) => !['80', '443', '22'].includes(p.port))
      .slice(0, 6);

    uniquePorts.forEach((pt) => {
      dataNodes.push({
        id: `port-${pt.port}`,
        label: `Port :${pt.port}`,
        sub: `${pt.process} (${pt.proto})`,
        category: 'port',
        tier: 4,
        x: 930,
        y: 0,
        color: '#8b5cf6',
        port: pt.port,
        process: pt.process,
        pid: pt.pid,
        isOnline: true
      });
    });

    if (dataNodes.length === 0) {
      dataNodes.push({
        id: 'port-standard',
        label: 'Ports :80, :443, :22',
        sub: 'Web Ingress & SSH Listening',
        category: 'port',
        tier: 4,
        x: 930,
        y: 280,
        color: '#8b5cf6',
        isOnline: true
      });
    }

    const totalData = dataNodes.length;
    dataNodes.forEach((node, idx) => {
      const y = 70 + idx * (440 / Math.max(1, totalData - 1 || 1));
      node.y = totalData === 1 ? 280 : y;
      n.push(node);

      // Connect from the nearest compute node or server gateway
      const sourceNode = computeNodes[idx % computeNodes.length] || { id: srvGatewayId };
      e.push({
        id: `edge-${sourceNode.id}-${node.id}`,
        from: sourceNode.id,
        to: node.id,
        color: node.color,
        animated: true
      });
    });

    return { nodes: n, edges: e };
  }, [servers, targetServer, nodeApps, nodePm2, nodeSup, nodePorts, nodeDocker, nodeCerts, nodeDbs]);

  // Node lookup map
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    let result = nodes;
    if (filterCat !== 'all') {
      result = result.filter((n) => n.category === filterCat || n.category === 'hub' || n.category === 'server');
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          n.sub.toLowerCase().includes(q) ||
          (n.port && String(n.port).includes(q)) ||
          (n.path && n.path.toLowerCase().includes(q))
      );
    }
    return result;
  }, [nodes, filterCat, searchQuery]);

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 sm:p-5 space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
              <Network className="w-5 h-5 text-emerald-400" />
            </span>
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              {targetServer ? t('topology.title', { name: targetServer.name }) : t('topology.fleetTitle')}
            </h2>
            <Badge variant="outline" className="text-[10px] font-mono border-[var(--border)]">
              {nodes.length} Components
            </Badge>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            {t('topology.subtitle')}
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center p-0.5 bg-[var(--background)] rounded-lg border border-[var(--border)] text-xs">
            <button
              onClick={() => setViewMode('pipeline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
                viewMode === 'pipeline'
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <GitFork className="w-3.5 h-3.5" />
              <span>{t('topology.flowPipeline')}</span>
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
                viewMode === 'matrix'
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{t('topology.serviceGrid')}</span>
            </button>
            <button
              onClick={() => setViewMode('isometric')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${
                viewMode === 'isometric'
                  ? 'btn-metal border shadow-sm'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>{t('topology.hologram')}</span>
            </button>
          </div>

          {targetServer && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDeepTopology(targetServer)}
              disabled={loadingNodeData}
              className="h-8 text-xs gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingNodeData ? 'animate-spin' : ''}`} />
              <span>{t('topology.rescan')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Quick Search Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Layer Filter Pills */}
        {targetServer && (
          <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
            {(
              [
                { id: 'all', label: t('topology.allLayers') },
                { id: 'ingress', label: `Ingress (${nodeCerts.length || 1})` },
                { id: 'webapp', label: `WebApps (${nodeApps.length})` },
                { id: 'docker', label: `Docker (${nodeDocker.length})` },
                { id: 'pm2', label: `PM2 (${nodePm2.length})` },
                { id: 'database', label: `Database (${nodeDbs.length})` },
                { id: 'port', label: `Ports (${nodePorts.length})` }
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                onClick={() => setFilterCat(c.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                  filterCat === c.id
                    ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]'
                    : 'bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* Live Search */}
        <div className="relative w-full sm:w-64 ml-auto">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            type="text"
            placeholder={t('topology.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs bg-[var(--background)]"
          />
        </div>
      </div>

      {/* INITIAL SCANNING RADAR LOADER */}
      {!hasLoadedOnce && loadingNodeData ? (
        <div className="relative rounded-xl border border-zinc-800 bg-[#09090b] min-h-[520px] flex flex-col items-center justify-center p-8 overflow-hidden text-center select-none">
          {/* Cyber Radar Grid Background */}
          <div
            className="absolute inset-0 pointer-events-none opacity-25"
            style={{
              backgroundImage:
                'radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.25), transparent 70%), linear-gradient(to right, #27272a 1px, transparent 1px), linear-gradient(to bottom, #27272a 1px, transparent 1px)',
              backgroundSize: '100% 100%, 36px 36px, 36px 36px'
            }}
          />

          {/* Concentric Radar Rings Animation */}
          <div className="relative flex items-center justify-center mb-6">
            <div className="absolute w-48 h-48 rounded-full border border-emerald-500/20 animate-ping duration-1000" />
            <div className="absolute w-36 h-36 rounded-full border border-sky-500/30 animate-pulse" />
            <div className="w-20 h-20 rounded-full bg-zinc-900 border border-emerald-500/40 shadow-xl shadow-emerald-500/10 flex items-center justify-center z-10">
              <Network className="w-8 h-8 text-emerald-400 animate-pulse" />
            </div>
          </div>

          <div className="relative z-10 space-y-2 max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{t('topology.scanningTitle')}</span>
            </div>
            <h3 className="text-sm font-semibold text-zinc-100">
              {t('topology.scanningTitle')}
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {t('topology.scanningSub')}
            </p>

            {/* 4 Layer Scanning Progress Pills */}
            <div className="flex items-center justify-center gap-2 pt-3 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-sky-400 flex items-center gap-1.5 animate-pulse">
                <Globe className="w-3 h-3" /> {t('topology.layerIngress')}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 animate-pulse delay-75">
                <Server className="w-3 h-3" /> {t('topology.layerGateway')}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-rose-400 flex items-center gap-1.5 animate-pulse delay-150">
                <Layers className="w-3 h-3" /> {t('topology.layerApps')}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-amber-400 flex items-center gap-1.5 animate-pulse delay-200">
                <Database className="w-3 h-3" /> {t('topology.layerData')}
              </span>
            </div>
          </div>
        </div>
      ) : viewMode !== 'matrix' ? (
        <div className="relative rounded-xl overflow-hidden border border-zinc-800 bg-[#09090b]">
          {/* Floating Pill on Rescan */}
          {loadingNodeData && hasLoadedOnce && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-zinc-950/90 border border-emerald-500/40 text-emerald-400 shadow-xl shadow-black/60 backdrop-blur-md flex items-center gap-2 text-xs font-mono animate-in fade-in">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              <span>{t('topology.updatingPill')}</span>
            </div>
          )}
          {/* Layer Headers for Pipeline Mode */}
          {targetServer && viewMode === 'pipeline' && (
            <div className="grid grid-cols-4 border-b border-zinc-800/80 bg-zinc-950/60 px-4 py-2 text-[11px] font-mono text-zinc-400">
              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                <span>1. {t('topology.layerIngress').toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <span>2. {t('topology.layerGateway').toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-rose-400" />
                <span>3. {t('topology.layerApps').toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                <span>4. {t('topology.layerData').toUpperCase()}</span>
              </div>
            </div>
          )}

          {/* Interactive Stage Canvas */}
          <div
            ref={stageRef}
            className="relative overflow-hidden select-none cursor-grab active:cursor-grabbing"
            style={{
              perspective: viewMode === 'isometric' ? 1400 : undefined,
              minHeight: 520
            }}
            onMouseMove={(e) => {
              if (e.buttons !== 1) return;
              if (viewMode === 'isometric' && !e.shiftKey) {
                setTilt((t) => ({
                  x: Math.max(0, Math.min(48, t.x - e.movementY * 0.25)),
                  z: Math.max(-35, Math.min(35, t.z + e.movementX * 0.25))
                }));
              } else {
                setPan((p) => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
              }
            }}
          >
            {/* Cyber Grid Background */}
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.16), transparent 70%), linear-gradient(to right, #27272a 1px, transparent 1px), linear-gradient(to bottom, #27272a 1px, transparent 1px)',
                backgroundSize: '100% 100%, 36px 36px, 36px 36px'
              }}
            />

            {/* Transform Canvas Wrapper */}
            <div
              className="w-full h-full transition-transform duration-150 ease-out"
              style={{
                transformStyle: viewMode === 'isometric' ? 'preserve-3d' : undefined,
                transform:
                  viewMode === 'isometric'
                    ? `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom * 0.95}) rotateX(${tilt.x}deg) rotateZ(${tilt.z}deg)`
                    : `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`
              }}
            >
              <svg viewBox="0 0 1050 560" className="w-full h-[520px] overflow-visible">
                <defs>
                  <filter id="topo-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Curved Fiber Connection Edges */}
                {edges.map((edge) => {
                  const from = nodeMap.get(edge.from);
                  const to = nodeMap.get(edge.to);
                  if (!from || !to) return null;

                  const mx = (from.x + to.x) / 2;
                  const d = `M ${from.x} ${from.y} C ${mx} ${from.y}, ${mx} ${to.y}, ${to.x} ${to.y}`;

                  return (
                    <g key={edge.id}>
                      <path
                        d={d}
                        fill="none"
                        stroke={edge.color}
                        strokeOpacity={0.35}
                        strokeWidth={2}
                        strokeDasharray={edge.animated ? '5,5' : undefined}
                      />
                      {edge.animated && (
                        <circle r="3.5" fill={edge.color} filter="url(#topo-glow)">
                          <animateMotion dur="3s" repeatCount="indefinite" path={d} />
                        </circle>
                      )}
                    </g>
                  );
                })}

                {/* Graph Nodes */}
                {filteredNodes.map((node) => {
                  const isSelected = selectedNode?.id === node.id;
                  const boxW = 180;
                  const boxH = 50;

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x - boxW / 2}, ${node.y - boxH / 2})`}
                      className="cursor-pointer group"
                      onClick={() => setSelectedNode(node)}
                    >
                      {/* Node Shadow */}
                      {viewMode === 'isometric' && (
                        <rect x={6} y={8} width={boxW} height={boxH} rx={10} fill="rgba(0,0,0,0.6)" />
                      )}

                      {/* Main Node Card */}
                      <rect
                        width={boxW}
                        height={boxH}
                        rx={10}
                        fill="#121215"
                        stroke={isSelected ? '#ffffff' : node.color}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                        className="transition-colors group-hover:brightness-125"
                      />

                      {/* Accent Strip */}
                      <rect x={0} y={10} width={4} height={boxH - 20} rx={2} fill={node.color} />

                      {/* Status Pulse Dot */}
                      <circle
                        cx={18}
                        cy={20}
                        r={4.5}
                        fill={node.isOnline !== false ? node.color : '#ef4444'}
                      />

                      {/* Labels */}
                      <text
                        x={30}
                        y={23}
                        fill="#f4f4f5"
                        fontSize="11"
                        fontWeight="600"
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                      >
                        {node.label.length > 20 ? node.label.slice(0, 19) + '…' : node.label}
                      </text>
                      <text
                        x={30}
                        y={38}
                        fill="#a1a1aa"
                        fontSize="9.5"
                        fontFamily="ui-monospace, SFMono-Regular, monospace"
                      >
                        {node.sub.length > 24 ? node.sub.slice(0, 23) + '…' : node.sub}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Bottom HUD Bar & Controls */}
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 bg-zinc-950/90 backdrop-blur-md border border-zinc-800 rounded-lg px-3 py-2 text-xs">
              <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> Ingress
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Proxy
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> WebApp
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Docker
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Database
                </span>
              </div>

              {/* Zoom & Canvas Reset */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-100"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] text-zinc-300 min-w-10 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.1).toFixed(2)))}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-100"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-3 bg-zinc-800" />
                <button
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                    setTilt({ x: 22, z: -6 });
                  }}
                  className="text-[11px] text-zinc-400 hover:text-zinc-100 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Reset View
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW MODE 2: Service Matrix (Dense Tabular Grid View) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* TIER 1: Ingress */}
          <Card className="p-4 bg-[var(--card)] border-[var(--border)] space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)]">
              <Globe className="w-4 h-4 text-sky-400" />
              <h3 className="font-semibold text-xs text-[var(--foreground)]">1. Ingress & Domains</h3>
            </div>
            <div className="space-y-2">
              {nodes.filter((n) => n.tier === 1).map((n) => (
                <div
                  key={n.id}
                  onClick={() => setSelectedNode(n)}
                  className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:border-sky-500/50 cursor-pointer transition space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-[var(--foreground)] truncate">{n.label}</span>
                    <span className="w-2 h-2 rounded-full bg-sky-400" />
                  </div>
                  <p className="text-[11px] font-mono text-[var(--muted-foreground)] truncate">{n.sub}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* TIER 2: Reverse Proxy */}
          <Card className="p-4 bg-[var(--card)] border-[var(--border)] space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)]">
              <Server className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold text-xs text-[var(--foreground)]">2. Reverse Proxy & Gateway</h3>
            </div>
            <div className="space-y-2">
              {nodes.filter((n) => n.tier === 2).map((n) => (
                <div
                  key={n.id}
                  onClick={() => setSelectedNode(n)}
                  className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:border-emerald-500/50 cursor-pointer transition space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-[var(--foreground)] truncate">{n.label}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                  <p className="text-[11px] font-mono text-[var(--muted-foreground)] truncate">{n.sub}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* TIER 3: Apps & Containers */}
          <Card className="p-4 bg-[var(--card)] border-[var(--border)] space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)]">
              <Layers className="w-4 h-4 text-rose-400" />
              <h3 className="font-semibold text-xs text-[var(--foreground)]">3. Apps & Containers</h3>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {nodes.filter((n) => n.tier === 3).map((n) => (
                <div
                  key={n.id}
                  onClick={() => setSelectedNode(n)}
                  className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:border-rose-500/50 cursor-pointer transition space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-[var(--foreground)] truncate">{n.label}</span>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: n.color }} />
                  </div>
                  <p className="text-[11px] font-mono text-[var(--muted-foreground)] truncate">{n.sub}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* TIER 4: Data & Ports */}
          <Card className="p-4 bg-[var(--card)] border-[var(--border)] space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)]">
              <Database className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-xs text-[var(--foreground)]">4. Data & Listening Ports</h3>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {nodes.filter((n) => n.tier === 4).map((n) => (
                <div
                  key={n.id}
                  onClick={() => setSelectedNode(n)}
                  className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:border-amber-500/50 cursor-pointer transition space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-[var(--foreground)] truncate">{n.label}</span>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: n.color }} />
                  </div>
                  <p className="text-[11px] font-mono text-[var(--muted-foreground)] truncate">{n.sub}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ACTIONABLE SLIDE-OVER INSPECTOR PANEL */}
      {selectedNode && (
        <Card className="p-5 bg-[var(--card)] border-[var(--border)] shadow-2xl animate-in slide-in-from-bottom-2 duration-200 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="p-2.5 rounded-xl border shrink-0"
                style={{
                  backgroundColor: `${selectedNode.color}15`,
                  borderColor: `${selectedNode.color}40`,
                  color: selectedNode.color
                }}
              >
                {selectedNode.category === 'database' ? (
                  <Database className="w-5 h-5" />
                ) : selectedNode.category === 'docker' ? (
                  <Box className="w-5 h-5" />
                ) : selectedNode.category === 'webapp' ? (
                  <FileCode className="w-5 h-5" />
                ) : selectedNode.category === 'ingress' ? (
                  <Globe className="w-5 h-5" />
                ) : selectedNode.category === 'pm2' ? (
                  <Zap className="w-5 h-5" />
                ) : (
                  <Server className="w-5 h-5" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm text-[var(--foreground)]">{selectedNode.label}</h3>
                  <Badge variant="outline" className="text-[10px] font-mono border-[var(--border)]">
                    {selectedNode.category.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--muted-foreground)] font-mono sensitive">{selectedNode.sub}</p>
              </div>
            </div>

            <button
              onClick={() => setSelectedNode(null)}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 rounded transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Node Meta Specs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs font-mono">
            <div>
              <span className="text-[10px] text-[var(--muted-foreground)] block">STATUS</span>
              <span className="font-semibold text-emerald-400">
                {selectedNode.isOnline !== false ? 'Active / Online' : 'Stopped / Inactive'}
              </span>
            </div>
            {selectedNode.port && (
              <div>
                <span className="text-[10px] text-[var(--muted-foreground)] block">PORT</span>
                <span className="font-semibold text-[var(--foreground)]">:{selectedNode.port}</span>
              </div>
            )}
            {selectedNode.path && (
              <div className="col-span-2 truncate">
                <span className="text-[10px] text-[var(--muted-foreground)] block">WORKING PATH</span>
                <span className="font-semibold text-[var(--foreground)] truncate sensitive">{selectedNode.path}</span>
              </div>
            )}
            {selectedNode.image && (
              <div className="col-span-2 truncate">
                <span className="text-[10px] text-[var(--muted-foreground)] block">DOCKER IMAGE</span>
                <span className="font-semibold text-[var(--foreground)] truncate">{selectedNode.image}</span>
              </div>
            )}
            {selectedNode.memory && (
              <div>
                <span className="text-[10px] text-[var(--muted-foreground)] block">MEMORY</span>
                <span className="font-semibold text-purple-400">{selectedNode.memory}</span>
              </div>
            )}
          </div>

          {/* One-Click Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[var(--border)]">
            {/* Open Browser URL */}
            {selectedNode.url && (
              <a
                href={selectedNode.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-semibold hover:opacity-90 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{t('topology.openBrowser')}</span>
              </a>
            )}

            {/* Open SFTP File Manager to app path */}
            {selectedNode.path && onOpenFiles && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenFiles(selectedNode.path)}
                className="gap-1.5 text-xs h-8"
              >
                <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                <span>{t('topology.openFiles')}</span>
              </Button>
            )}

            {/* Open Logs */}
            {onOpenLogs && (selectedNode.category === 'webapp' || selectedNode.category === 'docker' || selectedNode.category === 'pm2') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onOpenLogs({
                    type: selectedNode.category === 'docker' ? 'docker' : selectedNode.category === 'pm2' ? 'pm2' : 'service',
                    name: selectedNode.label.replace('PM2: ', '')
                  })
                }
                className="gap-1.5 text-xs h-8"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('topology.openLogs')}</span>
              </Button>
            )}

            {/* Jump into Terminal with Contextual CD command */}
            {onOpenTerminal && (
              <Button
                variant="outline"
                size="sm"
                // The terminal opens a plain shell on the server; it cannot take a startup command.
                onClick={() => targetServer && onOpenTerminal(targetServer)}
                className="gap-1.5 text-xs h-8"
              >
                <TermIcon className="w-3.5 h-3.5" />
                <span>{t('topology.openTerminal')}</span>
              </Button>
            )}

            {/* Navigate to Dedicated Management Tab */}
            {onNavigateTab && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (selectedNode.category === 'docker') onNavigateTab('docker');
                  else if (selectedNode.category === 'database') onNavigateTab('databases');
                  else if (selectedNode.category === 'webapp') onNavigateTab('webapps');
                  else if (selectedNode.category === 'pm2') onNavigateTab('pm2');
                  else if (selectedNode.category === 'ingress') onNavigateTab('ssl');
                  else if (selectedNode.category === 'nginx') onNavigateTab('nginx');
                }}
                className="gap-1 text-xs h-8 text-[var(--muted-foreground)] hover:text-[var(--foreground)] ml-auto"
              >
                <span>{t('topology.manageTab')}</span>
                <ArrowRight className="w-3 h-3" />
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
