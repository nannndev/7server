// Agent preferences, kept in this browser (like chat history) and sent with each request.
// The server turns guide ids into prompt text and places everything below its security rules.

export type AgentLanguage = 'auto' | 'id' | 'en';
export type AgentStyle = 'concise' | 'balanced' | 'detailed';

export interface AgentPreferences {
  language: AgentLanguage;
  style: AgentStyle;
  /** ids from GUIDES */
  guides: string[];
  /** free-form instructions applied to every chat */
  custom: string;
  /** per-server notes, keyed by server id (only the active server's note is sent) */
  serverNotes: Record<string, string>;
}

/** Ids must match GUIDE_TEXT in server/src/modules/ai-gateway/copilot.ts; labels are i18n keys `guide.<id>`. */
export const GUIDES = ['read-first', 'backup-before-edit', 'no-restart', 'explain-commands', 'summary-table', 'docker-aware'].map((id) => ({ id }));

export const DEFAULT_PREFERENCES: AgentPreferences = {
  language: 'auto',
  style: 'balanced',
  guides: ['read-first', 'no-restart'],
  custom: '',
  serverNotes: {}
};

export const LIMITS = { custom: 2000, serverNote: 1000 };

const KEY = '7server_copilot_prefs';

export function loadPreferences(): AgentPreferences {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    return p ? { ...DEFAULT_PREFERENCES, ...p, serverNotes: { ...(p.serverNotes || {}) } } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(p: AgentPreferences) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: in-memory only */ }
}

/** What is sent to the server for one request. */
export const preferencesPayload = (p: AgentPreferences, serverId?: string) => ({
  language: p.language,
  style: p.style,
  guides: p.guides,
  custom: p.custom.slice(0, LIMITS.custom),
  serverNote: serverId ? (p.serverNotes[serverId] || '').slice(0, LIMITS.serverNote) : ''
});
