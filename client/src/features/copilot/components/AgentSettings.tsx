import { useState } from 'react';
import { Check, Plus, RotateCcw, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { ServerItem } from '@/features/servers/types';
import { AGENT_PERSONALITIES, DEFAULT_PREFERENCES, GUIDES, LIMITS, parseSkillMarkdown, type AgentPreferences, type CustomSkill } from '../preferences';
import { PersonalityAvatar } from './PersonalityAvatar';
import { useT, type MessageKey } from '@/shared/i18n';

interface Props {
  value: AgentPreferences;
  server: ServerItem | null;
  onSave: (p: AgentPreferences) => void;
  onClose: () => void;
}

const Seg = <T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) => (
  <div role="radiogroup" aria-label={label} className="flex w-full rounded-lg border border-[var(--border)] p-0.5 bg-[var(--background)]">
    {options.map(([v, text]) => (
      <button
        key={v}
        type="button"
        role="radio"
        aria-checked={value === v}
        onClick={() => onChange(v)}
        className={`flex-1 px-2 py-1 rounded-md text-[11px] whitespace-nowrap transition-colors cursor-pointer ${
          value === v ? 'btn-metal' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
        }`}
      >
        {text}
      </button>
    ))}
  </div>
);

/** Panel inside the copilot drawer: edits a draft, saved explicitly. */
export function AgentSettings({ value, server, onSave, onClose }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<AgentPreferences>({ ...value, personality: value.personality || 'default', skills: value.skills || [] });
  const [addingSkill, setAddingSkill] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [skillTriggers, setSkillTriggers] = useState('');
  const [skillContent, setSkillContent] = useState('');
  const note = server ? draft.serverNotes[server.id] || '' : '';
  const dirty = JSON.stringify(draft) !== JSON.stringify({ ...value, skills: value.skills || [] });
  const set = (patch: Partial<AgentPreferences>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleGuide = (id: string) => set({ guides: draft.guides.includes(id) ? draft.guides.filter((g) => g !== id) : [...draft.guides, id] });

  const handleSkillContentChange = (raw: string) => {
    if (raw.trim().startsWith('---')) {
      const parsed = parseSkillMarkdown(raw);
      if (parsed.name && !skillName.trim()) setSkillName(parsed.name);
      if (parsed.triggers && !skillTriggers.trim()) setSkillTriggers(parsed.triggers);
      setSkillContent(parsed.content);
      return;
    }
    setSkillContent(raw);
  };

  const handleAddSkill = () => {
    const parsed = parseSkillMarkdown(skillContent);
    const finalName = (skillName.trim() || parsed.name || 'custom-skill').slice(0, 80);
    const finalTriggers = (skillTriggers.trim() || parsed.triggers || '').slice(0, 200);
    const finalContent = (parsed.content || skillContent).trim().slice(0, LIMITS.skill);
    if (!finalContent) return;
    const nextSkill: CustomSkill = {
      id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: finalName,
      triggers: finalTriggers,
      content: finalContent,
      enabled: true
    };
    set({ skills: [...(draft.skills || []), nextSkill] });
    setSkillName('');
    setSkillTriggers('');
    setSkillContent('');
    setAddingSkill(false);
  };

  const toggleSkill = (id: string) => {
    set({
      skills: (draft.skills || []).map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    });
  };

  const removeSkill = (id: string) => {
    set({
      skills: (draft.skills || []).filter((s) => s.id !== id)
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 animate-[expand-in_220ms_ease-out]">
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('copilot.settings')}</h3>
            <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{t('agentSettings.subtitle')}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} title={t('common.close')} className="h-8 w-8 shrink-0 text-[var(--muted-foreground)]">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              {t('agentSettings.personalityTitle')}
            </div>
            <span className="text-[10px] text-[var(--muted-foreground)]">
              {t('agentSettings.personalityHint')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {AGENT_PERSONALITIES.map((p) => {
              const selected = (draft.personality || 'default') === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set({ personality: p.id })}
                  className={`copilot-chip text-left p-2.5 rounded-xl border cursor-pointer transition-all ${
                    selected
                      ? 'border-[var(--rim)] bg-[var(--foreground)]/[0.06] shadow-sm ring-1 ring-[var(--rim)]/40'
                      : 'border-[var(--border)] bg-[var(--background)]/40 hover:border-[var(--rim)]/60 hover:bg-[var(--muted)]/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
                      <PersonalityAvatar personality={p.id} size={22} />
                      <span>{t(`personality.${p.id}.label` as MessageKey)}</span>
                    </span>
                    {selected && <Check className="w-3 h-3 text-emerald-500 shrink-0" />}
                  </div>
                  <p className="text-[10px] text-[var(--muted-foreground)] mt-1.5 leading-snug line-clamp-2">
                    {t(`personality.${p.id}.desc` as MessageKey)}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{t('agentSettings.style')}</div>
          <div className="space-y-2">
            <div className="grid grid-cols-[76px_1fr] items-center gap-2.5">
              <span className="text-[11px] font-medium text-[var(--muted-foreground)]">{t('agentSettings.language')}</span>
              <Seg
                label={t('agentSettings.language')}
                value={draft.language}
                onChange={(language) => set({ language })}
                options={[['auto', t('agentSettings.langAuto')], ['id', 'Indonesia'], ['en', 'English']]}
              />
            </div>
            <div className="grid grid-cols-[76px_1fr] items-center gap-2.5">
              <span className="text-[11px] font-medium text-[var(--muted-foreground)]">{t('agentSettings.length')}</span>
              <Seg
                label={t('agentSettings.length')}
                value={draft.style}
                onChange={(style) => set({ style })}
                options={[['concise', t('agentSettings.concise')], ['balanced', t('agentSettings.balanced')], ['detailed', t('agentSettings.detailed')]]}
              />
            </div>
            <div className="grid grid-cols-[76px_1fr] items-center gap-2.5">
              <span className="text-[11px] font-medium text-[var(--muted-foreground)]">{t('agentSettings.maxSteps')}</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <Seg
                  label={t('agentSettings.maxSteps')}
                  value={([8, 16, 30, 0].includes(draft.maxSteps) ? String(draft.maxSteps) : 'custom') as string}
                  onChange={(v) => {
                    if (v === 'custom') set({ maxSteps: draft.maxSteps > 0 ? draft.maxSteps : 25 });
                    else set({ maxSteps: Number(v) });
                  }}
                  options={[
                    ['8', '8'],
                    ['16', '16'],
                    ['30', '30'],
                    ['0', `∞ ${t('agentSettings.unlimited')}`]
                  ]}
                />
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={draft.maxSteps === 0 ? '' : draft.maxSteps}
                  placeholder="∞"
                  aria-label={t('agentSettings.maxSteps')}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      set({ maxSteps: 0 });
                      return;
                    }
                    const n = Math.max(1, Math.min(999, Math.floor(Number(raw) || 8)));
                    set({ maxSteps: n });
                  }}
                  className="w-14 h-[29px] px-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[11px] font-mono tabular-nums text-center text-[var(--foreground)] focus:outline-none focus:border-[var(--rim)] shrink-0"
                />
              </div>
            </div>
            {draft.maxSteps === 0 && (
              <div className="pl-[86px] text-[10.5px] text-amber-500/90 leading-snug">
                {t('agentSettings.unlimitedHint')}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{t('agentSettings.guides')}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {GUIDES.map((g, idx) => {
              const on = draft.guides.includes(g.id);
              const isOddLast = GUIDES.length % 2 === 1 && idx === GUIDES.length - 1;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGuide(g.id)}
                  aria-pressed={on}
                  className={`text-left p-3 rounded-xl border transition-colors flex flex-col justify-start cursor-pointer ${
                    isOddLast ? 'sm:col-span-2' : ''
                  } ${on ? 'border-[var(--rim)] bg-[var(--foreground)]/[0.06]' : 'border-[var(--border)] hover:border-[var(--rim)]'}`}
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-[var(--foreground)]">
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${on ? 'btn-metal border-transparent' : 'border-[var(--border)]'}`}>
                      {on && <Check className="w-2.5 h-2.5" />}
                    </span>
                    <span>{t(`guide.${g.id}` as MessageKey)}</span>
                  </div>
                  <div className="text-[10.5px] text-[var(--muted-foreground)] mt-1 pl-5 leading-snug">{t(`guide.${g.id}.desc` as MessageKey)}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>{t('agentSettings.customSkills')}</span>
              </div>
              <div className="text-[10.5px] text-[var(--muted-foreground)] mt-0.5 leading-snug">{t('agentSettings.customSkillsHint')}</div>
            </div>
            {!addingSkill && (
              <Button variant="outline" size="sm" onClick={() => setAddingSkill(true)} className="h-7 text-[11px] px-2.5 shrink-0">
                <Plus className="w-3 h-3 mr-1" /> {t('agentSettings.addSkill')}
              </Button>
            )}
          </div>

          {addingSkill && (
            <div className="p-3.5 rounded-xl border border-[var(--rim)] bg-[var(--background)] space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-start">
                <div className="flex flex-col gap-1 min-w-0">
                  <label htmlFor="skill-name-input" className="text-[10.5px] font-medium text-[var(--muted-foreground)] truncate">
                    {t('agentSettings.skillName')}
                  </label>
                  <input
                    id="skill-name-input"
                    type="text"
                    maxLength={80}
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                    placeholder={t('agentSettings.skillNamePlaceholder')}
                    className="h-8 w-full rounded-lg bg-[var(--card)] border border-[var(--border)] px-2.5 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:ring-1 focus:ring-[var(--ring)]"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <label htmlFor="skill-triggers-input" className="text-[10.5px] font-medium text-[var(--muted-foreground)] truncate">
                    {t('agentSettings.skillTriggers')}
                  </label>
                  <input
                    id="skill-triggers-input"
                    type="text"
                    maxLength={200}
                    value={skillTriggers}
                    onChange={(e) => setSkillTriggers(e.target.value)}
                    placeholder={t('agentSettings.skillTriggersPlaceholder')}
                    className="h-8 w-full rounded-lg bg-[var(--card)] border border-[var(--border)] px-2.5 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:ring-1 focus:ring-[var(--ring)]"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="skill-content-input" className="text-[10.5px] font-medium text-[var(--muted-foreground)]">
                  {t('agentSettings.skillContent')}
                </label>
                <textarea
                  id="skill-content-input"
                  rows={5}
                  maxLength={LIMITS.skill}
                  value={skillContent}
                  onChange={(e) => handleSkillContentChange(e.target.value)}
                  placeholder={t('agentSettings.skillContentPlaceholder')}
                  className="w-full resize-y rounded-lg bg-[var(--card)] border border-[var(--border)] p-2.5 text-xs font-mono text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:ring-1 focus:ring-[var(--ring)]"
                />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-mono tabular-nums text-[var(--muted-foreground)]">
                    {skillContent.length}/{LIMITS.skill}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => setAddingSkill(false)} className="h-7 text-[11px] px-2.5">
                      {t('common.cancel')}
                    </Button>
                    <Button size="sm" disabled={!skillContent.trim()} onClick={handleAddSkill} className="h-7 text-[11px] px-3 btn-metal">
                      {t('agentSettings.saveSkill')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(draft.skills || []).length > 0 ? (
            <div className="space-y-2">
              {(draft.skills || []).map((s) => (
                <div
                  key={s.id}
                  className={`flex items-start justify-between gap-2.5 p-3 rounded-xl border transition-colors ${
                    s.enabled ? 'border-[var(--rim)] bg-[var(--foreground)]/[0.04]' : 'border-[var(--border)] opacity-60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSkill(s.id)}
                    className="flex-1 text-left min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-xs font-medium text-[var(--foreground)] flex-wrap">
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${s.enabled ? 'btn-metal border-transparent' : 'border-[var(--border)]'}`}>
                        {s.enabled && <Check className="w-2.5 h-2.5" />}
                      </span>
                      <span className="truncate font-mono">{s.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)]">
                        {s.triggers?.trim() ? s.triggers : t('agentSettings.alwaysActive')}
                      </span>
                    </div>
                    <div className="text-[10.5px] text-[var(--muted-foreground)] mt-1 pl-5.5 line-clamp-2 font-mono">
                      {s.content}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSkill(s.id)}
                    className="p-1 text-[var(--muted-foreground)] hover:text-rose-500 transition-colors shrink-0 cursor-pointer"
                    title="Delete skill"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : !addingSkill ? (
            <div className="text-[11px] text-[var(--muted-foreground)] italic">{t('agentSettings.noCustomSkills')}</div>
          ) : null}
        </section>

        <section className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="agent-custom" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              {t('agentSettings.custom')}
            </label>
            <span className="text-[10px] font-mono tabular-nums text-[var(--muted-foreground)]">{draft.custom.length}/{LIMITS.custom}</span>
          </div>
          <textarea
            id="agent-custom"
            rows={4}
            maxLength={LIMITS.custom}
            value={draft.custom}
            onChange={(e) => set({ custom: e.target.value })}
            placeholder={t('agentSettings.customPlaceholder')}
            className="w-full resize-y rounded-xl bg-[var(--background)] border border-[var(--border)] p-3 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--ring)] outline-none"
          />
        </section>

        <section className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="agent-note" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] truncate">
              {t('agentSettings.serverNote')} {server ? <span className="normal-case font-normal">· {server.name}</span> : null}
            </label>
            {server && (
              <span className="text-[10px] font-mono tabular-nums text-[var(--muted-foreground)] shrink-0">
                {note.length}/{LIMITS.serverNote}
              </span>
            )}
          </div>
          {server ? (
            <>
              <textarea
                id="agent-note"
                rows={4}
                maxLength={LIMITS.serverNote}
                value={note}
                onChange={(e) => set({ serverNotes: { ...draft.serverNotes, [server.id]: e.target.value } })}
                placeholder={t('agentSettings.serverNotePlaceholder')}
                className="w-full resize-y rounded-xl bg-[var(--background)] border border-[var(--border)] p-3 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--ring)] outline-none"
              />
              <div className="text-[10px] text-[var(--muted-foreground)]">{t('agentSettings.serverNoteHint')}</div>
            </>
          ) : (
            <div className="text-[11px] text-[var(--muted-foreground)]">{t('agentSettings.pickServer')}</div>
          )}
        </section>

        <div className="flex items-start gap-2.5 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <span>{t('agentSettings.securityNote')}</span>
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-t border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-md">
        <Button variant="ghost" size="sm" onClick={() => setDraft({ ...DEFAULT_PREFERENCES, serverNotes: draft.serverNotes })} className="h-8 text-[var(--muted-foreground)]">
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> {t('agentSettings.default')}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8">{t('common.cancel')}</Button>
          <Button size="sm" disabled={!dirty} onClick={() => onSave(draft)} className="h-8 btn-metal">{t('common.save')}</Button>
        </div>
      </div>
    </div>
  );
}
