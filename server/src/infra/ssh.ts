import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import { WebSocket } from 'ws';
import { ServerCredentials, CommandResult } from '../modules/servers/types.js';

export function createSSHClient(serverConfig: ServerCredentials): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let isSettled = false;

    const timeout = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        try { conn.end(); } catch (e) {}
        reject(new Error('Connection timed out (15s)'));
      }
    }, 15000);

    conn.on('ready', () => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeout);
        resolve(conn);
      }
    });

    conn.on('error', (err) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    const connConfig: ConnectConfig = {
      host: serverConfig.host,
      port: serverConfig.port || 22,
      username: serverConfig.username || 'root',
      readyTimeout: 12000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3
    };

    if (serverConfig.authType === 'key' || (!serverConfig.password && serverConfig.privateKey)) {
      connConfig.privateKey = serverConfig.privateKey;
      if (serverConfig.passphrase) {
        connConfig.passphrase = serverConfig.passphrase;
      }
    } else {
      connConfig.password = serverConfig.password;
    }

    try {
      conn.connect(connConfig);
    } catch (err) {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timeout);
        reject(err);
      }
    }
  });
}

export async function testConnection(serverConfig: any): Promise<{ success: boolean; message: string }> {
  try {
    const conn = await createSSHClient(serverConfig);
    conn.end();
    return { success: true, message: 'SSH connection successful' };
  } catch (err: any) {
    return { success: false, message: err.message || 'SSH connection failed' };
  }
}

// opts.stdin is written then closed (keeps secrets/queries off the remote command line);
// opts.maxBytes caps stdout and stops the command once reached.
export async function executeCommand(
  serverConfig: ServerCredentials,
  command: string,
  timeoutMs = 25000,
  opts: { stdin?: string; maxBytes?: number } = {}
): Promise<CommandResult> {
  const conn = await createSSHClient(serverConfig);

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let isDone = false;
    let truncated = false;

    const timeout = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        try { conn.end(); } catch (e) {}
        reject(new Error(`Command timed out after ${timeoutMs / 1000}s`));
      }
    }, timeoutMs);

    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timeout);
        conn.end();
        return reject(err);
      }

      stream.on('close', (code: number, signal: string) => {
        if (!isDone) {
          isDone = true;
          clearTimeout(timeout);
          conn.end();
          resolve({ stdout, stderr, code: code !== undefined ? code : 0, signal, truncated: truncated || undefined });
        }
      });

      stream.on('data', (data: Buffer) => {
        if (truncated) return;
        stdout += data.toString();
        if (opts.maxBytes && stdout.length > opts.maxBytes) {
          truncated = true;
          stdout = stdout.slice(0, opts.maxBytes);
          stream.close();
        }
      });

      stream.stderr.on('data', (data: Buffer) => {
        if (stderr.length < 64 * 1024) stderr += data.toString();
      });

      if (opts.stdin !== undefined) stream.end(opts.stdin);
    });
  });
}

/**
 * Execute command with real-time streaming chunks for long operations (docker pull, apt install, etc.).
 */
export async function executeCommandStream(
  serverConfig: ServerCredentials,
  command: string,
  onChunk: (chunk: string, isStderr: boolean) => void,
  timeoutMs = 180000,
  opts: { stdin?: string } = {}
): Promise<CommandResult> {
  const conn = await createSSHClient(serverConfig);

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let isDone = false;

    const timeout = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        try { conn.end(); } catch (e) {}
        reject(new Error(`Command timed out after ${timeoutMs / 1000}s`));
      }
    }, timeoutMs);

    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timeout);
        conn.end();
        return reject(err);
      }

      stream.on('close', (code: number, signal: string) => {
        if (!isDone) {
          isDone = true;
          clearTimeout(timeout);
          conn.end();
          resolve({ stdout, stderr, code: code !== undefined ? code : 0, signal });
        }
      });

      stream.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        stdout += text;
        try { onChunk(text, false); } catch {}
      });

      stream.stderr.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        stderr += text;
        try { onChunk(text, true); } catch {}
      });

      if (opts.stdin !== undefined) stream.end(opts.stdin);
    });
  });
}

export async function attachTerminal(ws: WebSocket, serverConfig: ServerCredentials, initialCols = 80, initialRows = 24): Promise<void> {
  let conn: Client;
  try {
    conn = await createSSHClient(serverConfig);
  } catch (err: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', data: `SSH Connection Failed: ${err.message}\r\n` }));
      ws.close();
    }
    return;
  }

  conn.shell({
    term: 'xterm-256color',
    cols: initialCols,
    rows: initialRows
  }, (err, stream) => {
    if (err) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', data: `Failed to open shell: ${err.message}\r\n` }));
        ws.close();
      }
      conn.end();
      return;
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'connected' }));
    }

    // SSH stream -> WebSocket
    stream.on('data', (data: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data: data.toString('utf-8') }));
      }
    });

    stream.on('close', () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'closed', data: '\r\n[Session closed by remote host]\r\n' }));
        ws.close();
      }
      conn.end();
    });

    // WebSocket -> SSH stream
    ws.on('message', (message: string | Buffer) => {
      try {
        const msg = JSON.parse(message.toString());
        if (msg.type === 'data') {
          stream.write(msg.data);
        } else if (msg.type === 'resize' && msg.cols && msg.rows) {
          stream.setWindow(msg.rows, msg.cols, 0, 0);
        }
      } catch (e) {
        // Raw text input fallback
        stream.write(message.toString());
      }
    });

    ws.on('close', () => {
      try {
        stream.end();
        conn.end();
      } catch (e) {}
    });

    ws.on('error', () => {
      try {
        stream.end();
        conn.end();
      } catch (e) {}
    });
  });
}


// Opens an SFTP session, runs fn, always closes the connection.
export async function withSftp<T>(serverConfig: ServerCredentials, fn: (sftp: SFTPWrapper) => Promise<T>): Promise<T> {
  const conn = await createSSHClient(serverConfig);
  try {
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) =>
      conn.sftp((err, s) => (err ? reject(err) : resolve(s)))
    );
    return await fn(sftp);
  } finally {
    conn.end();
  }
}
