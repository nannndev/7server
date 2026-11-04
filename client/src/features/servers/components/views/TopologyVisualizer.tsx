import React, { useEffect, useRef, useState } from 'react';
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
  Terminal,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { ServerItem } from '@/features/servers/types';
import { WebAppInfo, ListeningPortInfo } from '@/features/webapps';
import { Pm2ProcessInfo, SupervisorProcessInfo } from '@/features/processes';
import { fetchWebApps, fetchListeningPorts } from '@/features/webapps';
import { fetchPm2AndSupervisor } from '@/features/processes';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';

interface TopologyVisualizerProps {
  servers: ServerItem[];
  focusedServer?: ServerItem | null;
  onSelectServer?: (server: ServerItem) => void;
  onOpenTerminal?: (server: ServerItem) => void;
}

interface GraphNode {
  id: string;
  label: string;
  sub: string;
  category: 'hub' | 'server' | 'nginx' | 'webapp' | 'pm2' | 'port';
  x: number;
  y: number;
  color: string;
  status?: string;
  url?: string;
  serverRef?: ServerItem;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  color: string;
  animated?: boolean;
}

export default function TopologyVisualizer({
  servers,
  focusedServer,
  onSelectServer,
  onOpenTerminal
}: TopologyVisualizerProps) {
  const [activeServerId, setActiveServerId] = useState<string>(
    focusedServer?.id || (servers.length === 1 ? servers[0].id : 'ALL')
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const [is3D, setIs3D] = useState(true);
  const [tilt, setTilt] = useState({ x: 24, z: -8 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loadingNodeData, setLoadingNodeData] = useState(false);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      setZoom((z) => Math.min(2.2, Math.max(0.45, +(z + delta).toFixed(2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const [nodeApps, setNodeApps] = useState<WebAppInfo[]>([]);
  const [nodePm2, setNodePm2] = useState<Pm2ProcessInfo[]>([]);
  const [nodeSup, setNodeSup] = useState<SupervisorProcessInfo[]>([]);
  const [nodePorts, setNodePorts] = useState<ListeningPortInfo[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [filterCat, setFilterCat] = useState<'all' | 'webapp' | 'pm2' | 'port'>('all');

  useEffect(() => {
    if (focusedServer) {
      setActiveServerId(focusedServer.id);
    }
  }, [focusedServer?.id]);

  const targetServer = servers.find((s) => s.id === activeServerId) || null;

  const loadDeepTopology = async (srv: ServerItem) => {
    setLoadingNodeData(true);
    try {
      const [apps, pm2Res, portsRes] = await Promise.all([
        fetchWebApps(srv.id).catch(() => []),
        fetchPm2AndSupervisor(srv.id).catch(() => ({ pm2: [], supervisor: [] })),
        fetchListeningPorts(srv.id).catch(() => ({ ports: [], ufwStatus: '', raw: '' }))
      ]);
      setNodeApps(apps);
      setNodePm2(pm2Res.pm2 || []);
      setNodeSup(pm2Res.supervisor || []);
      setNodePorts(portsRes.ports || []);
    } finally {
      setLoadingNodeData(false);
    }
  };

  useEffect(() => {
    if (targetServer) {
      loadDeepTopology(targetServer);
    }
  }, [targetServer?.id]);

  // Build SVG Graph Nodes & Edges (ViewBox 1000 x 560)
  const { nodes, edges } = React.useMemo(() => {
    const n: GraphNode[] = [];
    const e: GraphEdge[] = [];

    if (!targetServer) {
      // FLEET TOPOLOGY MODE
      n.push({
        id: 'hub-core',
        label: 'VPS Hub Core',
        sub: `${servers.length} Connected Nodes`,
        category: 'hub',
        x: 500,
        y: 280,
        color: '#38bdf8'
      });

      const count = servers.length || 1;
      servers.forEach((srv, idx) => {
        const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
        const rx = 270;
        const ry = 165;
        const sx = 500 + Math.cos(angle) * rx;
        const sy = 280 + Math.sin(angle) * ry;
        const online = srv.status === 'online';

        n.push({
          id: `srv-${srv.id}`,
          label: srv.name,
          sub: `${srv.host} · CPU ${srv.metrics?.cpuUsagePercent ?? 0}%`,
          category: 'server',
          x: sx,
          y: sy,
          color: online ? '#10b981' : '#ef4444',
          status: srv.status,
          serverRef: srv
        });

        e.push({
          id: `edge-hub-${srv.id}`,
          from: 'hub-core',
          to: `srv-${srv.id}`,
          color: online ? '#10b981' : '#ef4444',
          animated: online
        });

        // Satellite workload indicators around each server
        const satellites = [
          {
            id: `sat-www-${srv.id}`,
            label: '/var/www Apps',
            sub: 'Nginx + Web/API',
            color: '#38bdf8',
            cat: 'webapp' as const
          },
          {
            id: `sat-ram-${srv.id}`,
            label: `RAM ${srv.metrics?.memory?.usedPercent ?? 0}%`,
            sub: `${srv.metrics?.cpuCores || 1} vCPU Cores`,
            color: '#a78bfa',
            cat: 'pm2' as const
          },
          {
            id: `sat-dsk-${srv.id}`,
            label: `Disk ${srv.metrics?.disk?.usedPercent ?? 0}%`,
            sub: srv.metrics?.docker?.installed
              ? `${srv.metrics.docker.runningContainers} Docker`
              : 'Systemd Services',
            color: '#f59e0b',
            cat: 'port' as const
          }
        ];

        satellites.forEach((sat, sIdx) => {
          const satAngle = angle + (sIdx - 1) * 0.55;
          const satX = Math.max(85, Math.min(915, sx + Math.cos(satAngle) * 145));
          const satY = Math.max(55, Math.min(505, sy + Math.sin(satAngle) * 105));
          n.push({
            id: sat.id,
            label: sat.label,
            sub: sat.sub,
            category: sat.cat,
            x: satX,
            y: satY,
            color: sat.color,
            serverRef: srv
          });
          e.push({
            id: `edge-${srv.id}-${sat.id}`,
            from: `srv-${srv.id}`,
            to: sat.id,
            color: sat.color,
            animated: online
          });
        });
      });

      return { nodes: n, edges: e };
    }

    // SINGLE SERVER DEEP ARCHITECTURE TOPOLOGY MODE
    // Column 1 (x=130): Internet / Nginx Gateway
    // Column 2 (x=370): Server Core Node
    // Column 3 (x=660): /var/www WebApps & PM2 Workers
    // Column 4 (x=900): Listening Ports / DB / Docker
    const srvId = `core-${targetServer.id}`;
    n.push({
      id: 'nginx-gateway',
      label: 'Nginx Gateway',
      sub: `${nodeApps.filter((a) => a.domain).length} Active Domains`,
      category: 'nginx',
      x: 120,
      y: 280,
      color: '#38bdf8'
    });

    n.push({
      id: srvId,
      label: targetServer.name,
      sub: `${targetServer.host} (${targetServer.metrics?.cpuUsagePercent ?? 0}% CPU)`,
      category: 'server',
      x: 340,
      y: 280,
      color: '#10b981',
      serverRef: targetServer
    });

    e.push({
      id: 'edge-gw-core',
      from: 'nginx-gateway',
      to: srvId,
      color: '#38bdf8',
      animated: true
    });

    // WebApps (/var/www) column
    if (filterCat === 'all' || filterCat === 'webapp') {
      const topApps = nodeApps.slice(0, 8);
      topApps.forEach((app, idx) => {
        const y = 60 + idx * (440 / Math.max(1, topApps.length - 1 || 1));
        const appId = `app-${app.name}`;
        const firstDomain = app.domain?.split(',').find((d) => d && !d.startsWith('www.'));
        n.push({
          id: appId,
          label: app.name,
          sub: firstDomain || app.type,
          category: 'webapp',
          x: 630,
          y: topApps.length === 1 ? 180 : y,
          color: app.type.includes('Laravel') ? '#f43f5e' : app.type.includes('Node') ? '#22c55e' : '#38bdf8',
          url: firstDomain ? `http://${firstDomain}` : undefined
        });
        e.push({
          id: `edge-core-${appId}`,
          from: srvId,
          to: appId,
          color: '#38bdf8',
          animated: true
        });
      });
    }

    // PM2 & Supervisor Workers column
    if (filterCat === 'all' || filterCat === 'pm2') {
      const workers = [
        ...nodePm2.map((p) => ({
          id: `pm2-${p.pm_id}`,
          name: `PM2: ${p.name}`,
          sub: `${p.memoryMB}MB · ${p.status}`,
          ok: p.status === 'online'
        })),
        ...nodeSup.map((s) => ({
          id: `sup-${s.name}`,
          name: `Worker: ${s.name}`,
          sub: s.status,
          ok: s.status === 'RUNNING'
        }))
      ].slice(0, 6);

      workers.forEach((w, idx) => {
        const y = 85 + idx * (390 / Math.max(1, workers.length - 1 || 1));
        n.push({
          id: w.id,
          label: w.name,
          sub: w.sub,
          category: 'pm2',
          x: filterCat === 'pm2' ? 630 : 870,
          y: workers.length === 1 ? 200 : y,
          color: w.ok ? '#a78bfa' : '#ef4444'
        });
        e.push({
          id: `edge-core-${w.id}`,
          from: srvId,
          to: w.id,
          color: '#a78bfa',
          animated: w.ok
        });
      });
    }

    // Listening Ports (if filtered to port or if few workers)
    if (filterCat === 'port' || (filterCat === 'all' && nodePm2.length === 0 && nodeSup.length === 0)) {
      const uniquePorts = Array.from(new Map(nodePorts.map((p) => [p.port, p])).values()).slice(0, 7);
      uniquePorts.forEach((pt, idx) => {
        const y = 75 + idx * (410 / Math.max(1, uniquePorts.length - 1 || 1));
        const pidId = `port-${pt.port}`;
        n.push({
          id: pidId,
          label: `Port :${pt.port}`,
          sub: `${pt.process} (${pt.proto})`,
          category: 'port',
          x: 870,
          y: uniquePorts.length === 1 ? 280 : y,
          color: '#f59e0b'
        });
        e.push({
          id: `edge-core-${pidId}`,
          from: srvId,
          to: pidId,
          color: '#f59e0b',
          animated: true
        });
      });
    }

    return { nodes: n, edges: e };
  }, [servers, targetServer, nodeApps, nodePm2, nodeSup, nodePorts, filterCat]);

  const nodeMap = React.useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 sm:p-5 space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5 mr-2">
            <Network className="w-4 h-4 text-emerald-400" /> 3D Service & Network Topology Visualizer
          </span>

          {/* Server Selector Pills */}
          {!focusedServer && (
            <div className="flex items-center gap-1 bg-[var(--background)] p-1 rounded-lg border border-[var(--border)]">
              <button
                onClick={() => setActiveServerId('ALL')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  activeServerId === 'ALL'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                Fleet Mesh ({servers.length})
              </button>
              {servers.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveServerId(s.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                    activeServerId === s.id
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {/* Layer Filter when inspecting a single server */}
          {targetServer && (
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'all', label: 'Semua Layer' },
                  { id: 'webapp', label: `/var/www (${nodeApps.length})` },
                  { id: 'pm2', label: `PM2 & Workers (${nodePm2.length + nodeSup.length})` },
                  { id: 'port', label: `Ports (${nodePorts.length})` }
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setFilterCat(c.id)}
                  className={`px-2 py-1 rounded text-[11px] border transition ${
                    filterCat === c.id
                      ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                      : 'bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIs3D((v) => !v)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition flex items-center gap-1 ${
              is3D
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                : 'bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]'
            }`}
          >
            <Box className="w-3 h-3" /> {is3D ? '3D Perspective On' : '2D Flat View'}
          </button>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] bg-[var(--background)] px-2.5 py-1 rounded-lg border border-[var(--border)]">
            <button
              onClick={() => setZoom((z) => Math.max(0.45, +(z - 0.1).toFixed(2)))}
              className="p-0.5 rounded hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={0.45}
              max={2.2}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-20 accent-sky-400 cursor-pointer"
              aria-label="Zoom Topology 3D"
            />
            <button
              onClick={() => setZoom(1)}
              className="font-mono text-[11px] w-11 text-center hover:text-[var(--foreground)]"
              title="Klik untuk reset zoom 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.1).toFixed(2)))}
              className="p-0.5 rounded hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-3.5 bg-[var(--border)] mx-0.5" />
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
                setTilt({ x: 24, z: -8 });
              }}
              className="flex items-center gap-1 hover:text-[var(--foreground)] text-[11px]"
              title="Reset Zoom & Tilt"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>

          {targetServer && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDeepTopology(targetServer)}
              disabled={loadingNodeData}
              className="h-7 text-xs gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loadingNodeData ? 'animate-spin' : ''}`} /> Scan
            </Button>
          )}
        </div>
      </div>

      {/* 3D Interactive Topology Canvas */}
      <div
        ref={stageRef}
        className="relative overflow-hidden rounded-xl bg-[#09090b] border border-zinc-800/90 select-none cursor-grab active:cursor-grabbing"
        style={{ perspective: 1400, minHeight: 480 }}
        onMouseMove={(e) => {
          if (e.buttons !== 1) return;
          if (e.shiftKey || !is3D) {
            setPan((p) => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
          } else {
            setTilt((t) => ({
              x: Math.max(0, Math.min(48, t.x - e.movementY * 0.25)),
              z: Math.max(-35, Math.min(35, t.z + e.movementX * 0.25))
            }));
          }
        }}
      >
        {/* Background Cyber Grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-25"
          style={{
            backgroundImage:
              'radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.16), transparent 65%), linear-gradient(to right, #27272a 1px, transparent 1px), linear-gradient(to bottom, #27272a 1px, transparent 1px)',
            backgroundSize: '100% 100%, 32px 32px, 32px 32px'
          }}
        />

        <div
          className="w-full h-full transition-transform duration-150 ease-out"
          style={{
            transformStyle: 'preserve-3d',
            transform: is3D
              ? `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom * 0.95}) rotateX(${tilt.x}deg) rotateZ(${tilt.z}deg)`
              : `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`
          }}
        >
          <svg viewBox="0 0 1000 560" className="w-full h-[480px] overflow-visible">
            <defs>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Curved Fiber Edges & Animated Data Packets */}
            {edges.map((edge) => {
              const from = nodeMap.get(edge.from);
              const to = nodeMap.get(edge.to);
              if (!from || !to) return null;
              const mx = (from.x + to.x) / 2;
              const d = `M ${from.x} ${from.y} C ${mx} ${from.y}, ${mx} ${to.y}, ${to.x} ${to.y}`;
              return (
                <g key={edge.id}>
                  <path d={d} fill="none" stroke={edge.color} strokeOpacity={0.28} strokeWidth={2} />
                  {edge.animated && (
                    <circle r="3.5" fill={edge.color} filter="url(#glow)">
                      <animateMotion dur="2.6s" repeatCount="indefinite" path={d} />
                    </circle>
                  )}
                </g>
              );
            })}

            {/* Graph Nodes */}
            {nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const boxW = node.category === 'hub' || node.category === 'server' ? 175 : 165;
              const boxH = 48;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x - boxW / 2}, ${node.y - boxH / 2})`}
                  className="cursor-pointer group"
                  onClick={() => {
                    setSelectedNode(node);
                    if (node.category === 'server' && node.serverRef && activeServerId === 'ALL') {
                      setActiveServerId(node.serverRef.id);
                    }
                  }}
                >
                  {/* 3D Drop Shadow under node */}
                  {is3D && (
                    <rect
                      x={6}
                      y={10}
                      width={boxW}
                      height={boxH}
                      rx={10}
                      fill="rgba(0,0,0,0.65)"
                    />
                  )}

                  {/* Node Card */}
                  <rect
                    width={boxW}
                    height={boxH}
                    rx={10}
                    fill="#121215"
                    stroke={isSelected ? '#ffffff' : node.color}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />

                  {/* Left Accent Bar */}
                  <rect x={0} y={8} width={4} height={boxH - 16} rx={2} fill={node.color} />

                  {/* Pulse Dot */}
                  <circle cx={16} cy={18} r={4} fill={node.color} />

                  {/* Labels */}
                  <text
                    x={28}
                    y={21}
                    fill="#f4f4f5"
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                  >
                    {node.label.length > 20 ? node.label.slice(0, 19) + '…' : node.label}
                  </text>
                  <text
                    x={28}
                    y={36}
                    fill="#a1a1aa"
                    fontSize="9.5"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                    className="sensitive"
                  >
                    {node.sub.length > 23 ? node.sub.slice(0, 22) + '…' : node.sub}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Bottom HUD Legend & Selected Node Inspector */}
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 bg-zinc-950/90 backdrop-blur-md border border-zinc-800 rounded-lg px-3 py-2 text-xs">
          <div className="flex items-center gap-3 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> VPS Server
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> Nginx / WebApp
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400" /> PM2 / Worker
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Port / Storage
            </span>
          </div>

          {selectedNode ? (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px] text-zinc-200 border-zinc-700">
                {selectedNode.label} · <span className="sensitive">{selectedNode.sub}</span>
              </Badge>
              {selectedNode.url && (
                <a
                  href={selectedNode.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:underline inline-flex items-center gap-1 text-[11px]"
                >
                  Buka URL <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {selectedNode.serverRef && onSelectServer && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => onSelectServer(selectedNode.serverRef!)}
                >
                  <Activity className="w-3 h-3" /> Manage
                </Button>
              )}
              {selectedNode.serverRef && onOpenTerminal && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => onOpenTerminal(selectedNode.serverRef!)}
                >
                  <Terminal className="w-3 h-3" /> SSH
                </Button>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-zinc-500">
              {is3D ? 'Drag mouse untuk memiringkan hologram 3D · ' : ''}Klik node untuk detail arsitektur
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

