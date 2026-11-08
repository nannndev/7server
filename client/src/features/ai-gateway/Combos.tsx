// Combo editor: a named, ordered list of `alias/model` targets. Calling `auto/<name>` tries them in
// order (server: service.ts). Models come from the logged-in accounts, so only routable ones are offered.
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Layers, Plus, Trash2, X } from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { useI18n } from '@/shared/i18n';
import { deleteCombo, fetchAccounts, fetchCombos, saveCombo } from './api';
import { ModelPicker } from '@/features/copilot/components/ModelPicker';

const ALIAS: Record<string, string> = {
  claude: 'cc',
  codex: 'cx',
  copilot: 'gh',
  'gemini-cli': 'gc',
  kimi: 'km',
  kilocode: 'kc',
  muse: 'mu',
  nous: 'ns'
};

export function Combos() {
  const { t } = useI18n();
  const [combos, setCombos] = useState<Record<string, string[]>>({});
  const [options, setOptions] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);

  useEffect(() => {
    fetchCombos().then(setCombos).catch((e) => toast.error(e.message));
    fetchAccounts()
      .then(({ accounts, models, aliases }) =>
        setOptions(
          accounts.flatMap((a) => {
            const prefix = aliases?.[a.provider] || ALIAS[a.provider];
            return prefix ? (models[a.provider] || []).map((m) => `${prefix}/${m}`) : [];
          })
        )
      )
      .catch(() => setOptions([]));
  }, []);

  const move = (i: number, d: number) =>
    setTargets((list) => {
      const next = [...list];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  const submit = async () => {
    try {
      setCombos(await saveCombo(name.trim(), targets));
      toast.success(t('combo.saved'));
      setName('');
      setTargets([]);
      setShowBuilder(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const copyComboId = (comboName: string) => {
    const id = `auto/${comboName}`;
    navigator.clipboard.writeText(id).then(() => toast.success(t('common.copied')));
  };

  const availableOptions = options.filter((o) => !targets.includes(o));
  const comboEntries = Object.entries(combos);

  return (
    <Card className="p-3.5 space-y-3 bg-[var(--card)] border border-[var(--border)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-400 flex items-center justify-center shrink-0">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-semibold text-[var(--foreground)]">{t('combo.title')}</h3>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                auto/&lt;name&gt;
              </span>
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)] truncate">{t('combo.desc')}</p>
          </div>
        </div>
        {!showBuilder && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowBuilder(true)}
            className="h-7 px-2.5 text-[11px] shrink-0"
          >
            <Plus className="w-3 h-3 mr-1" /> New Combo
          </Button>
        )}
      </div>

      {comboEntries.length === 0 && !showBuilder ? (
        <p className="text-[11px] text-[var(--muted-foreground)]">{t('combo.empty')}</p>
      ) : (
        comboEntries.length > 0 && (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {comboEntries.map(([n, list]) => (
              <li
                key={n}
                className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)]/50 px-2.5 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => copyComboId(n)}
                  title={`Click to copy auto/${n}`}
                  className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/25 hover:bg-violet-500/20 flex items-center gap-1 shrink-0 transition-colors"
                >
                  <span>auto/{n}</span>
                  <Copy className="w-2.5 h-2.5 opacity-70" />
                </button>
                <span className="flex-1 min-w-0 truncate font-mono text-[10.5px] text-[var(--muted-foreground)]" title={list.join(' → ')}>
                  {list.join(' → ')}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setName(n);
                    setTargets(list);
                    setShowBuilder(true);
                  }}
                  className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline-offset-2 hover:underline shrink-0"
                >
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  aria-label={`${t('combo.delete')} ${n}`}
                  title={t('combo.delete')}
                  onClick={async () => setCombos(await deleteCombo(n))}
                  className="p-1 rounded text-[var(--muted-foreground)] hover:text-red-500 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {(showBuilder || comboEntries.length === 0) && (
        <div className="pt-2 border-t border-[var(--border)]/60 grid gap-2.5 sm:grid-cols-[170px_1fr] items-start">
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-[var(--muted-foreground)]">{t('combo.name')}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder={t('combo.namePh')}
              className="font-mono text-xs h-8"
              maxLength={40}
            />
          </label>
          <div className="space-y-1.5 min-w-0">
            <span className="text-[11px] font-medium text-[var(--muted-foreground)]">{t('combo.targets')}</span>
            {targets.length > 0 && (
              <ol className="flex flex-wrap gap-1.5">
                {targets.map((m, i) => (
                  <li
                    key={`${m}-${i}`}
                    className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 font-mono text-[11px]"
                  >
                    <span className="text-[10px] text-[var(--muted-foreground)] font-sans font-semibold">#{i + 1}</span>
                    <span className="truncate max-w-[180px]">{m}</span>
                    <button
                      type="button"
                      aria-label="Up"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      className="p-0.5 disabled:opacity-30 hover:text-[var(--foreground)]"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Down"
                      disabled={i === targets.length - 1}
                      onClick={() => move(i, 1)}
                      className="p-0.5 disabled:opacity-30 hover:text-[var(--foreground)]"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => setTargets((l) => l.filter((_, j) => j !== i))}
                      className="p-0.5 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <div className="flex items-center gap-2">
              <ModelPicker
                value=""
                onChange={(selected) => {
                  if (selected && !targets.includes(selected)) {
                    setTargets((l) => [...l, selected].slice(0, 8));
                  }
                }}
                options={availableOptions}
                allowAuto={false}
                placeholder={t('combo.pick')}
                placement="bottom"
                variant="input"
                disabled={targets.length >= 8 || !availableOptions.length}
              />
              {showBuilder && comboEntries.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowBuilder(false);
                    setName('');
                    setTargets([]);
                  }}
                  className="h-8 text-xs"
                >
                  {t('common.cancel')}
                </Button>
              )}
              <Button size="sm" onClick={submit} disabled={!name.trim() || !targets.length} className="h-8 text-xs btn-metal shrink-0">
                <Plus className="w-3.5 h-3.5 mr-1" />
                {t('combo.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
