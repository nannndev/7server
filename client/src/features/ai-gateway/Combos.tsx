// Combo editor: a named, ordered list of `alias/model` targets. Calling `auto/<name>` tries them in
// order (server: service.ts). Models come from the logged-in accounts, so only routable ones are offered.
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { useI18n } from '@/shared/i18n';
import { deleteCombo, fetchAccounts, fetchCombos, saveCombo } from './api';

const ALIAS: Record<string, string> = { claude: 'cc', codex: 'cx', copilot: 'gh', 'gemini-cli': 'gc', kimi: 'km' };

export function Combos() {
  const { t } = useI18n();
  const [combos, setCombos] = useState<Record<string, string[]>>({});
  const [options, setOptions] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [targets, setTargets] = useState<string[]>([]);

  useEffect(() => {
    fetchCombos().then(setCombos).catch((e) => toast.error(e.message));
    fetchAccounts()
      .then(({ accounts, models }) => setOptions(accounts.flatMap((a) => (models[a.provider] || []).map((m) => `${ALIAS[a.provider]}/${m}`))))
      .catch(() => setOptions([]));
  }, []);

  const move = (i: number, d: number) => setTargets((list) => {
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
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{t('combo.title')}</h3>
        <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{t('combo.desc')}</p>
      </div>

      {Object.keys(combos).length === 0 ? (
        <p className="text-[11px] text-[var(--muted-foreground)]">{t('combo.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {Object.entries(combos).map(([n, list]) => (
            <li key={n} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
              <code className="font-mono text-xs font-semibold shrink-0">auto/{n}</code>
              <span className="flex-1 min-w-0 truncate font-mono text-[11px] text-[var(--muted-foreground)]">{list.join(' → ')}</span>
              <button type="button" onClick={() => { setName(n); setTargets(list); }} className="text-[11px] underline-offset-2 hover:underline">{t('common.edit')}</button>
              <button type="button" aria-label={`${t('combo.delete')} ${n}`} title={t('combo.delete')}
                onClick={async () => setCombos(await deleteCombo(n))} className="p-1 rounded text-[var(--muted-foreground)] hover:text-red-500">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-[180px_1fr] items-start">
        <label className="space-y-1">
          <span className="text-[11px] font-medium">{t('combo.name')}</span>
          <Input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder={t('combo.namePh')} className="font-mono text-xs" maxLength={40} />
        </label>
        <div className="space-y-1">
          <span className="text-[11px] font-medium">{t('combo.targets')}</span>
          <ol className="space-y-1">
            {targets.map((m, i) => (
              <li key={`${m}-${i}`} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 font-mono text-[11px]">
                <span className="w-4 text-[var(--muted-foreground)]">{i + 1}</span>
                <span className="flex-1 truncate">{m}</span>
                <button type="button" aria-label="Up" disabled={i === 0} onClick={() => move(i, -1)} className="p-0.5 disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                <button type="button" aria-label="Down" disabled={i === targets.length - 1} onClick={() => move(i, 1)} className="p-0.5 disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
                <button type="button" aria-label="Remove" onClick={() => setTargets((l) => l.filter((_, j) => j !== i))} className="p-0.5 hover:text-red-500"><X className="w-3 h-3" /></button>
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            <select
              value=""
              onChange={(e) => { if (e.target.value) setTargets((l) => [...l, e.target.value].slice(0, 8)); }}
              disabled={targets.length >= 8 || !options.length}
              aria-label={t('combo.add')}
              className="h-8 flex-1 min-w-0 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 font-mono text-[11px]"
            >
              <option value="">{t('combo.pick')}</option>
              {options.filter((o) => !targets.includes(o)).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <Button size="sm" onClick={submit} disabled={!name.trim() || !targets.length}>
              <Plus className="w-3.5 h-3.5 mr-1" />{t('combo.save')}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
