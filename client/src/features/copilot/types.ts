export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface CopilotContext {
  serverId?: string;
  serverName?: string;
  host?: string;
  os?: string;
  tab?: string;
  errorSnippet?: string;
}

