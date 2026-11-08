import { useState } from 'react';
import { Check, Plus, RotateCcw, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { ServerItem } from '@/features/servers/types';
import { DEFAULT_PREFERENCES, GUIDES, LIMITS, parseSkillMarkdown, type AgentPreferences, type CustomSkill } from '../preferences';
import { useT, type MessageKey } from '@/shared/i18n';

interface Props {
  value: AgentPreferences;
  server: ServerItem | null;
  onSave: (p: AgentPreferences) => void;
  onClose: () => void;
}

const Seg = <T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) => (
  <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-[var(--border)] p-0.5 bg-[var(--background)]">
    {options.map(([v, text]) => (
      <button
        key={v}
        role="radio"
        aria-checked={value === v}
        onClick={() => onChange(v)}
        className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${value === v ? 'btn-metal' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
      >
        {text}
      </button>
    ))}
  </div>
);

/** Panel inside the copilot drawer: edits a draft, saved explicitly. */
export function AgentSettings({ value, server, onSave, onClose }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<AgentPreferences>({ ...value, skills: value.skills || [] });
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
    <div className="flex-1 overflow-y-auto animate-[expand-in_220ms_ease-out]">
      <div className="p-4 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('copilot.settings')}</h3>
            <p className="text-[11px] text-[var(--muted-foreground)]">{t('agentSettings.subtitle')}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} title={t('common.close')} className="h-8 w-8 text-[var(--muted-foreground)]">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <section className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{t('agentSettings.style')}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Seg label={t('agentSettings.language')} value={draft.language} onChange={(language) => set({ language })} options={[['auto', t('agentSettings.langAuto')], ['id', 'Indonesia'], ['en', 'English']]} />
            <Seg label={t('agentSettings.length')} value={draft.style} onChange={(style) => set({ style })} options={[['concise', t('agentSettings.concise')], ['balanced', t('agentSettings.balanced')], ['detailed', t('agentSettings.detailed')]]} />
          </div>
        </section>

        <section className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{t('agentSettings.guides')}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {GUIDES.map((g) => {
              const on = draft.guides.includes(g.id);
              return (
                <button
                  key={g.id}
                  onClick={() => toggleGuide(g.id)}
                  aria-pressed={on}
                  className={`text-left p-2.5 rounded-xl border transition-colors ${on ? 'border-[var(--rim)] bg-[var(--foreground)]/[0.06]' : 'border-[var(--border)] hover:border-[var(--rim)]'}`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--foreground)]">
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${on ? 'btn-metal border-transparent' : 'border-[var(--border)]'}`}>
                      {on && <Check className="w-2.5 h-2.5" />}
                    </span>
                    {t(`guide.${g.id}` as MessageKey)}
                  </div>
                  <div className="text-[10.5px] text-[var(--muted-foreground)] mt-1 leading-snug">{t(`guide.${g.id}.desc` as MessageKey)}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                {t('agentSettings.customSkills')}
              </div>
              <div className="text-[10.5px] text-[var(--muted-foreground)] mt-0.5">{t('agentSettings.customSkillsHint')}</div>
            </div>
            {!addingSkill && (
              <Button variant="outline" size="sm" onClick={() => setAddingSkill(true)} className="h-7 text-[11px] px-2.5">
                <Plus className="w-3 h-3 mr-1" /> {t('agentSettings.addSkill')}
              </Button>
            )}
          </div>

          {addingSkill && (
            <div className="p-3 rounded-xl border border-[var(--rim)] bg-[var(--background)] space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10.5px] font-medium text-[var(--muted-foreground)]">{t('agentSettings.skillName')}</label>
                  <input
                    type="text"
                    maxLength={80}
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                    placeholder={t('agentSettings.skillNamePlaceholder')}
                    className="mt-1 w-full rounded-lg bg-[var(--card)] border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:ring-1 focus:ring-[var(--ring)]"
                  />
                </div>
                <div>
                  <label className="text-[10.5px] font-medium text-[var(--muted-foreground)]">{t('agentSettings.skillTriggers')}</label>
                  <input
                    type="text"
                    maxLength={200}
                    value={skillTriggers}
                    onChange={(e) => setSkillTriggers(e.target.value)}
                    placeholder={t('agentSettings.skillTriggersPlaceholder')}
                    className="mt-1 w-full rounded-lg bg-[var(--card)] border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:ring-1 focus:ring-[var(--ring)]"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10.5px] font-medium text-[var(--muted-foreground)]">{t('agentSettings.skillContent')}</label>
                <textarea
                  rows={5}
                  maxLength={LIMITS.skill}
                  value={skillContent}
                  onChange={(e) => handleSkillContentChange(e.target.value)}
                  placeholder={t('agentSettings.skillContentPlaceholder')}
                  className="mt-1 w-full resize-y rounded-lg bg-[var(--card)] border border-[var(--border)] p-2 text-xs font-mono text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:ring-1 focus:ring-[var(--ring)]"
                />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-[var(--muted-foreground)]">{skillContent.length}/{LIMITS.skill}</span>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => setAddingSkill(false)} className="h-6 text-[11px] px-2">
                      {t('common.cancel')}
                    </Button>
                    <Button size="sm" disabled={!skillContent.trim()} onClick={handleAddSkill} className="h-6 text-[11px] px-2.5 btn-metal">
                      {t('agentSettings.saveSkill')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(draft.skills || []).length > 0 ? (
            <div className="space-y-1.5">
              {(draft.skills || []).map((s) => (
                <div
                  key={s.id}
                  className={`flex items-start justify-between gap-2 p-2.5 rounded-xl border transition-colors ${
                    s.enabled ? 'border-[var(--rim)] bg-[var(--foreground)]/[0.04]' : 'border-[var(--border)] opacity-60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSkill(s.id)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--foreground)]">
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${s.enabled ? 'btn-metal border-transparent' : 'border-[var(--border)]'}`}>
                        {s.enabled && <Check className="w-2.5 h-2.5" />}
                      </span>
                      <span className="truncate font-mono">{s.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)]">
                        {s.triggers?.trim() ? s.triggers : t('agentSettings.alwaysActive')}
                      </span>
                    </div>
                    <div className="text-[10.5px] text-[var(--muted-foreground)] mt-1 line-clamp-2 font-mono">
                      {s.content}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSkill(s.id)}
                    className="p-1 text-[var(--muted-foreground)] hover:text-rose-400 transition-colors shrink-0"
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
          <label htmlFor="agent-custom" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{t('agentSettings.custom')}</label>
          <textarea
            id="agent-custom"
            rows={5}
            maxLength={LIMITS.custom}
            value={draft.custom}
            onChange={(e) => set({ custom: e.target.value })}
            placeholder={t('agentSettings.customPlaceholder')}
            className="w-full resize-y rounded-xl bg-[var(--background)] border border-[var(--border)] p-2.5 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--ring)] outline-none"
          />
          <div className="text-[10px] text-right text-[var(--muted-foreground)]">{draft.custom.length}/{LIMITS.custom}</div>
        </section>

        <section className="space-y-1.5">
          <label htmlFor="agent-note" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            {t('agentSettings.serverNote')} {server ? <span className="normal-case font-normal">· {server.name}</span> : null}
          </label>
          {server ? (
            <>
              <textarea
                id="agent-note"
                rows={4}
                maxLength={LIMITS.serverNote}
                value={note}
                onChange={(e) => set({ serverNotes: { ...draft.serverNotes, [server.id]: e.target.value } })}
                placeholder={t('agentSettings.serverNotePlaceholder')}
                className="w-full resize-y rounded-xl bg-[var(--background)] border border-[var(--border)] p-2.5 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--ring)] outline-none"
              />
              <div className="text-[10px] text-right text-[var(--muted-foreground)]">{note.length}/{LIMITS.serverNote} · {t('agentSettings.serverNoteHint')}</div>
            </>
          ) : (
            <div className="text-[11px] text-[var(--muted-foreground)]">{t('agentSettings.pickServer')}</div>
          )}
        </section>

        <div className="flex gap-2 p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-[10.5px] text-[var(--muted-foreground)]">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          {t('agentSettings.securityNote')}
        </div>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 px-4 py-3 border-t border-[var(--border)] bg-[var(--card)]">
        <Button variant="ghost" size="sm" onClick={() => setDraft({ ...DEFAULT_PREFERENCES, serverNotes: draft.serverNotes })} className="text-[var(--muted-foreground)]">
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> {t('agentSettings.default')}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="sm" disabled={!dirty} onClick={() => onSave(draft)} className="btn-metal">{t('common.save')}</Button>
        </div>
      </div>
    </div>
  );
}
