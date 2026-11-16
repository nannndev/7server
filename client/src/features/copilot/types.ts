/** One shell command or Cloudflare action the AI proposed, and what happened to it. */
export interface CommandRun {
  kind?: 'bash' | 'cloudflare';
  code: string;
  /** pending = waiting (auto-run queue or user approval) */
  status: 'pending' | 'running' | 'done' | 'skipped';
  /** read-only and agent auto-run enabled: runs without asking */
  auto: boolean;
  output?: string;
  exitCode?: number | null;
  durationMs?: number;
}

export interface CopilotError {
  title: string;
  items: { provider: string; reason: string; detail?: string }[];
  hint?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** 'tool' = command output fed back to the AI; 'compact' = summarized earlier conversation context */
  kind?: 'tool' | 'compact';
  runs?: CommandRun[];
  serverId?: string;
  /** agent loop depth for this user prompt */
  step?: number;
  /** outputs already sent back to the AI (loop guard) */
  fed?: boolean;
  /** halted cleanly after hitting MAX_STEPS; user can click Continue */
  stepLimit?: boolean;
  /** request failure: rendered as an error card, never sent back to the model */
  error?: CopilotError;
  /** resolved model that generated this assistant reply (e.g. "cc/claude-sonnet-4-6" or "groq/llama-3.3-70b-versatile") */
  model?: string;
}

export interface CopilotContext {
  serverId?: string;
  serverName?: string;
  host?: string;
  os?: string;
  tab?: string;
  errorSnippet?: string;
  preferences?: ReturnType<typeof import('./preferences').preferencesPayload>;
}

export type CopilotRunMode = 'manual' | 'agent' | 'auto';

export type CopilotBubbleAction =
  | 'approve'
  | 'approveAll'
  | 'skip'
  | 'stop'
  | 'continue'
  | 'retry'
  | 'dismiss';

export interface CopilotLiveStatus {
  state: 'idle' | 'thinking' | 'executing' | 'approval' | 'limit' | 'done' | 'error';
  mode?: CopilotRunMode;
  step?: number;
  maxSteps?: number;
  pendingCount?: number;
  isRisky?: boolean;
  serverName?: string;
  command?: string;
  preview?: string;
}


