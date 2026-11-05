import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import type { ServerItem } from '@/features/servers';
import { getToken } from '@/shared/api/client';

export interface TerminalSessionHandle {
  sendData: (data: string) => void;
  clear: () => void;
  reconnect: () => void;
  getBufferText: () => string;
  fit: () => void;
  focus: () => void;
  getDimensions: () => { cols: number; rows: number };
}

interface TerminalSessionCanvasProps {
  server: ServerItem;
  sessionId: string;
  initialCommand?: string;
  onClearInitialCommand?: () => void;
  isActive: boolean;
  theme: ITheme;
  fontSize: number;
  onStatusChange: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  onDimensionsChange?: (dims: { cols: number; rows: number }) => void;
}

export const TerminalSessionCanvas = forwardRef<TerminalSessionHandle, TerminalSessionCanvasProps>(
  function TerminalSessionCanvas(
    {
      server,
      sessionId,
      initialCommand,
      onClearInitialCommand,
      isActive,
      theme,
      fontSize,
      onStatusChange,
      onDimensionsChange
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const bufferLogRef = useRef<string[]>([]);
    const initialCmdSentRef = useRef(false);

    // Expose control handles to parent
    useImperativeHandle(ref, () => ({
      sendData: (data: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'data', data }));
          xtermRef.current?.focus();
        }
      },
      clear: () => {
        xtermRef.current?.clear();
        bufferLogRef.current = [];
      },
      reconnect: () => {
        if (xtermRef.current && fitAddonRef.current) {
          xtermRef.current.writeln(`\r\n\x1b[1;30m>> Reconnecting session...\x1b[0m\r\n`);
          if (wsRef.current) wsRef.current.close();
          connectWebSocket(xtermRef.current, fitAddonRef.current);
        }
      },
      getBufferText: () => {
        if (xtermRef.current) {
          xtermRef.current.selectAll();
          const selected = xtermRef.current.getSelection();
          xtermRef.current.clearSelection();
          if (selected) return selected;
        }
        return bufferLogRef.current.join('');
      },
      fit: () => {
        if (fitAddonRef.current && isActive) {
          fitAddonRef.current.fit();
          const dims = fitAddonRef.current.proposeDimensions();
          if (dims) {
            onDimensionsChange?.(dims);
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
            }
          }
        }
      },
      focus: () => {
        xtermRef.current?.focus();
      },
      getDimensions: () => {
        const proposed = fitAddonRef.current?.proposeDimensions();
        return proposed || { cols: 80, rows: 24 };
      }
    }));

    // Connect WebSocket
    const connectWebSocket = (term: Terminal, fitAddon: FitAddon) => {
      onStatusChange('connecting');
      const dims = fitAddon.proposeDimensions() || { cols: 80, rows: 24 };
      onDimensionsChange?.(dims);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/terminal?serverId=${server.id}&cols=${dims.cols}&rows=${dims.rows}&token=${encodeURIComponent(getToken())}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        onStatusChange('connected');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'data') {
            term.write(msg.data);
            bufferLogRef.current.push(msg.data);
          } else if (msg.type === 'error') {
            term.write(`\r\n\x1b[1;31m[Error] ${msg.data}\x1b[0m\r\n`);
            onStatusChange('error');
          } else if (msg.type === 'closed') {
            term.write(`\r\n\x1b[1;33m${msg.data || '[Session Disconnected]'}\x1b[0m\r\n`);
            onStatusChange('disconnected');
          } else if (msg.type === 'connected') {
            onStatusChange('connected');
            if (initialCommand && !initialCmdSentRef.current) {
              initialCmdSentRef.current = true;
              ws.send(JSON.stringify({ type: 'data', data: initialCommand + '\n' }));
              onClearInitialCommand?.();
            }
          }
        } catch {
          term.write(event.data);
          bufferLogRef.current.push(event.data);
        }
      };

      ws.onerror = () => {
        term.write(`\r\n\x1b[1;31m>> WebSocket connection error.\x1b[0m\r\n`);
        onStatusChange('error');
      };

      ws.onclose = () => {
        onStatusChange('disconnected');
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }));
        }
      });
    };

    // Initialize Terminal on Mount
    useEffect(() => {
      if (!containerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize,
        lineHeight: 1.25,
        scrollback: 5000,
        allowTransparency: true,
        theme
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());

      term.open(containerRef.current);
      fitAddon.fit();

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      const proposed = fitAddon.proposeDimensions();
      if (proposed) onDimensionsChange?.(proposed);

      term.writeln(`\x1b[1;30m[7Server Web SSH]\x1b[0m \x1b[1;36mSession established to ${server.name} (${server.username}@${server.host}:${server.port || 22})...\x1b[0m\r\n`);

      connectWebSocket(term, fitAddon);

      // Auto resize observation
      const resizeObserver = new ResizeObserver(() => {
        try {
          if (fitAddonRef.current && containerRef.current && containerRef.current.offsetParent !== null) {
            fitAddonRef.current.fit();
            const dims = fitAddonRef.current.proposeDimensions() || { cols: 80, rows: 24 };
            onDimensionsChange?.(dims);
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
            }
          }
        } catch {}
      });

      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
        if (wsRef.current) wsRef.current.close();
        term.dispose();
      };
    }, [sessionId]);

    // Update Theme on prop change
    useEffect(() => {
      if (xtermRef.current) {
        xtermRef.current.options.theme = theme;
      }
    }, [theme]);

    // Update Font Size on prop change
    useEffect(() => {
      if (xtermRef.current && fitAddonRef.current) {
        xtermRef.current.options.fontSize = fontSize;
        if (isActive) {
          setTimeout(() => {
            fitAddonRef.current?.fit();
          }, 30);
        }
      }
    }, [fontSize, isActive]);

    // When tab becomes active, trigger fit and focus
    useEffect(() => {
      if (isActive && fitAddonRef.current && xtermRef.current) {
        setTimeout(() => {
          fitAddonRef.current?.fit();
          const dims = fitAddonRef.current?.proposeDimensions();
          if (dims) {
            onDimensionsChange?.(dims);
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
            }
          }
          xtermRef.current?.focus();
        }, 50);
      }
    }, [isActive]);

    return (
      <div
        ref={containerRef}
        className="w-full h-full p-3.5 relative overflow-hidden"
        style={{ backgroundColor: theme.background }}
      />
    );
  }
);

