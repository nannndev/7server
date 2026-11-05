import { useState } from 'react';
import { Check, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { ServerItem } from '@/features/servers/types';
import { DEFAULT_PREFERENCES, GUIDES, LIMITS, type AgentPreferences } from '../preferences';
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
        className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${value === v ? 'bg-purple-600 text-white' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
      >
        {text}
      </button>
    ))}
  </div>
);

/** Panel inside the copilot drawer: edits a draft, saved explicitly. */
export function AgentSettings({ value, server, onSave, onClose }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<AgentPreferences>(value);
  const note = server ? draft.serverNotes[server.id] || '' : '';
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const set = (patch: Partial<AgentPreferences>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleGuide = (id: string) => set({ guides: draft.guides.includes(id) ? draft.guides.filter((g) => g !== id) : [...draft.guides, id] });

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
                  className={`text-left p-2.5 rounded-xl border transition-colors ${on ? 'border-purple-500/60 bg-purple-500/10' : 'border-[var(--border)] hover:border-purple-500/30'}`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--foreground)]">
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${on ? 'bg-purple-600 border-purple-600' : 'border-[var(--border)]'}`}>
                      {on && <Check className="w-2.5 h-2.5 text-white" />}
                    </span>
                    {t(`guide.${g.id}` as MessageKey)}
                  </div>
                  <div className="text-[10.5px] text-[var(--muted-foreground)] mt-1 leading-snug">{t(`guide.${g.id}.desc` as MessageKey)}</div>
                </button>
              );
            })}
          </div>
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
            className="w-full resize-y rounded-xl bg-[var(--background)] border border-[var(--border)] p-2.5 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 focus:ring-purple-500 outline-none"
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
                className="w-full resize-y rounded-xl bg-[var(--background)] border border-[var(--border)] p-2.5 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 focus:ring-purple-500 outline-none"
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
          <Button size="sm" disabled={!dirty} onClick={() => onSave(draft)} className="bg-purple-600 hover:bg-purple-700 text-white">{t('common.save')}</Button>
        </div>
      </div>
    </div>
  );
}
