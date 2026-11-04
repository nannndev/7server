import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Maximize2, Minimize2, RotateCcw, X, Terminal as TermIcon, Trash2 } from 'lucide-react';
import { ServerItem } from '@/features/servers';
import { getToken } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';

interface TerminalModalProps {
  server: ServerItem;
  initialCommand?: string;
  onClose: () => void;
}

export default function TerminalModal({ server, onClose, initialCommand }: TerminalModalProps) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const xtermInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#fafafa',
        cursorAccent: '#09090b',
        selectionBackground: 'rgba(250, 250, 250, 0.2)',
        black: '#18181b',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#38bdf8',
        white: '#f4f4f5',
        brightBlack: '#52525b',
        brightRed: '#ef4444',
        brightGreen: '#22c55e',
        brightYellow: '#eab308',
        brightBlue: '#3b82f6',
        brightMagenta: '#a855f7',
        brightCyan: '#06b6d4',
        brightWhite: '#ffffff'
      }
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermInstance.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln(`\x1b[1;30m[VPS Hub Web SSH]\x1b[0m \x1b[1;37mConnecting to ${server.name} (${server.host}:${server.port || 22})...\x1b[0m\r\n`);

    connectWebSocket(term, fitAddon);

    const handleResize = () => {
      try {
        if (fitAddonRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
          fitAddonRef.current.fit();
          const dims = fitAddonRef.current.proposeDimensions() || { cols: 80, rows: 24 };
          wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
        }
      } catch (e) {}
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) {
        wsRef.current.close();
      }
      term.dispose();
    };
  }, [server.id]);

  const connectWebSocket = (term: Terminal, fitAddon: FitAddon) => {
    setStatus('connecting');
    const dims = fitAddon.proposeDimensions() || { cols: 80, rows: 24 };
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal?serverId=${server.id}&cols=${dims.cols}&rows=${dims.rows}&token=${encodeURIComponent(getToken())}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data') {
          term.write(msg.data);
        } else if (msg.type === 'error') {
          term.write(`\r\n\x1b[1;31m[Error] ${msg.data}\x1b[0m\r\n`);
          setStatus('error');
        } else if (msg.type === 'closed') {
          term.write(`\r\n\x1b[1;33m${msg.data || '[Session Disconnected]'}\x1b[0m\r\n`);
          setStatus('disconnected');
        } else if (msg.type === 'connected') {
          setStatus('connected');
          if (initialCommand) ws.send(JSON.stringify({ type: 'data', data: initialCommand + '\n' }));
        }
      } catch (e) {
        term.write(event.data);
      }
    };

    ws.onerror = () => {
      term.write(`\r\n\x1b[1;31m>> WebSocket connection error.\x1b[0m\r\n`);
      setStatus('error');
    };

    ws.onclose = () => {
      setStatus('disconnected');
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    });
  };

  const handleReconnect = () => {
    if (xtermInstance.current && fitAddonRef.current) {
      xtermInstance.current.writeln(`\r\n\x1b[1;30m>> Reconnecting...\x1b[0m\r\n`);
      if (wsRef.current) wsRef.current.close();
      connectWebSocket(xtermInstance.current, fitAddonRef.current);
    }
  };

  const handleClear = () => {
    if (xtermInstance.current) {
      xtermInstance.current.clear();
    }
  };

  const sendShortcut = (cmd: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'data', data: `${cmd}\n` }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
      <div
        className={`bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isFullScreen ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[85vh]'
        }`}
      >
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-950 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="p-1 rounded-md bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
              <TermIcon className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-zinc-100">{server.name}</span>
              <span className="text-[11px] text-zinc-500 font-mono sensitive">({server.username}@{server.host}:{server.port || 22})</span>
            </div>
            <Badge
              variant={
                status === 'connected'
                  ? 'success'
                  : status === 'connecting'
                  ? 'warning'
                  : 'destructive'
              }
              className="text-[10px] py-0 px-1.5 h-4 font-normal gap-1"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  status === 'connected'
                    ? 'bg-emerald-400'
                    : status === 'connecting'
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-red-400'
                }`}
              />
              {status}
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleReconnect}
              title="Reconnect"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClear}
              title="Clear"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={isFullScreen ? 'Minimize' : 'Maximize'}
              className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
            >
              {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              title="Close"
              className="h-7 w-7 text-zinc-400 hover:text-red-400"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Quick Commands Bar */}
        <div className="px-4 py-1.5 bg-zinc-950/60 border-b border-zinc-800/60 flex items-center gap-1.5 overflow-x-auto text-xs">
          <span className="text-zinc-500 text-[11px] font-mono mr-1">Quick:</span>
          {[
            { label: 'htop', cmd: 'htop' },
            { label: 'top', cmd: 'top' },
            { label: 'df -h', cmd: 'df -h' },
            { label: 'free -m', cmd: 'free -m' },
            { label: 'docker ps', cmd: 'docker ps' },
            { label: 'systemctl', cmd: 'systemctl --failed' },
            { label: 'clear', cmd: 'clear' }
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => sendShortcut(item.cmd)}
              className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-mono text-[10px] transition border border-zinc-800"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Terminal Canvas */}
        <div className="flex-1 bg-[#09090b] p-3 relative overflow-hidden">
          <div ref={terminalRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
