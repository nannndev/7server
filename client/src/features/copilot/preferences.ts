// Agent preferences, kept in this browser (like chat history) and sent with each request.
// The server turns guide ids into prompt text and places everything below its security rules.

export type AgentLanguage = 'auto' | 'id' | 'en';
export type AgentStyle = 'concise' | 'balanced' | 'detailed';
export type AgentPersonality = 'default' | 'casual' | 'calm' | 'comedic' | 'grumpy' | 'hype';

export interface PersonalityMeta {
  id: AgentPersonality;
  badgeClass: string;
}

export const AGENT_PERSONALITIES: PersonalityMeta[] = [
  { id: 'default', badgeClass: 'border-[var(--rim)] bg-[var(--muted)]/70 text-[var(--foreground)]' },
  { id: 'casual', badgeClass: 'border-sky-500/35 bg-sky-500/10 text-sky-400' },
  { id: 'calm', badgeClass: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-400' },
  { id: 'comedic', badgeClass: 'border-violet-500/35 bg-violet-500/10 text-violet-400' },
  { id: 'grumpy', badgeClass: 'border-rose-500/35 bg-rose-500/10 text-rose-400' },
  { id: 'hype', badgeClass: 'border-amber-500/35 bg-amber-500/10 text-amber-400' }
];

export const getPersonalityMeta = (id?: AgentPersonality): PersonalityMeta =>
  AGENT_PERSONALITIES.find((p) => p.id === id) || AGENT_PERSONALITIES[0];

export interface CustomSkill {
  id: string;
  name: string;
  /** Optional comma-separated trigger keywords; empty means always active when enabled */
  triggers?: string;
  content: string;
  enabled: boolean;
}

export interface AgentPreferences {
  language: AgentLanguage;
  style: AgentStyle;
  personality: AgentPersonality;
  /** Max automatic agent steps per prompt (`0` = unlimited) */
  maxSteps: number;
  /** ids from GUIDES */
  guides: string[];
  /** user-defined custom skills / SKILL.md playbooks */
  skills: CustomSkill[];
  /** free-form instructions applied to every chat */
  custom: string;
  /** per-server notes, keyed by server id (only the active server's note is sent) */
  serverNotes: Record<string, string>;
}

/** Ids must match GUIDE_TEXT in server/src/modules/ai-gateway/copilot.ts; labels are i18n keys `guide.<id>`. */
export const GUIDES = ['devops-engineer', 'read-first', 'backup-before-edit', 'no-restart', 'explain-commands', 'summary-table', 'docker-aware'].map((id) => ({ id }));

export const DEFAULT_PREFERENCES: AgentPreferences = {
  language: 'auto',
  style: 'balanced',
  personality: 'default',
  maxSteps: 8,
  guides: ['devops-engineer', 'read-first', 'no-restart'],
  skills: [],
  custom: '',
  serverNotes: {}
};

export const LIMITS = { custom: 2000, serverNote: 1000, skill: 4000 };

/** Parses a SKILL.md string (with optional YAML frontmatter) into name, triggers, and markdown body. */
export function parseSkillMarkdown(raw: string): { name: string; triggers: string; content: string } {
  const trimmed = raw.trim();
  const fmMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fmMatch) {
    const frontmatter = fmMatch[1];
    const body = fmMatch[2].trim();
    const nameMatch = frontmatter.match(/^name:\s*["']?([^"'\r\n]+)["']?/m);
    const triggersMatch = frontmatter.match(/^triggers:\s*["']?([^"'\r\n]+)["']?/m);
    return {
      name: nameMatch ? nameMatch[1].trim() : 'custom-skill',
      triggers: triggersMatch ? triggersMatch[1].trim() : '',
      content: body || trimmed
    };
  }
  const headingMatch = trimmed.match(/^#\s+([^\r\n]+)\r?\n+([\s\S]*)$/);
  if (headingMatch) {
    return {
      name: headingMatch[1].trim().slice(0, 60),
      triggers: '',
      content: headingMatch[2].trim() || trimmed
    };
  }
  return { name: '', triggers: '', content: trimmed };
}

const KEY = '7server_copilot_prefs';

export function loadPreferences(): AgentPreferences {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!p) return DEFAULT_PREFERENCES;
    const rawSteps = Number(p.maxSteps);
    const maxSteps =
      Number.isFinite(rawSteps) && rawSteps >= 0
        ? Math.min(999, Math.floor(rawSteps))
        : DEFAULT_PREFERENCES.maxSteps;
    return {
      ...DEFAULT_PREFERENCES,
      ...p,
      maxSteps,
      skills: Array.isArray(p.skills) ? p.skills : [],
      serverNotes: { ...(p.serverNotes || {}) }
    };
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
  personality: p.personality || 'default',
  guides: p.guides,
  skills: (p.skills || [])
    .filter((s) => s.enabled && s.content.trim())
    .slice(0, 10)
    .map((s) => ({
      name: (s.name || 'Custom Skill').slice(0, 80),
      triggers: (s.triggers || '').slice(0, 200),
      content: s.content.slice(0, LIMITS.skill)
    })),
  custom: p.custom.slice(0, LIMITS.custom),
  serverNote: serverId ? (p.serverNotes[serverId] || '').slice(0, LIMITS.serverNote) : ''
});
