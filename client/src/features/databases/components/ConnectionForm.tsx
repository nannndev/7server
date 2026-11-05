import React from 'react';
import { X } from 'lucide-react';
import { DbEngine, DbAuth } from '@/features/databases/api';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Modal } from '@/shared/ui/modal';
import { useT } from '@/shared/i18n';

export const AUTH_LABEL: Record<DbAuth, string> = {
  'container-env': 'Credentials from container env',
  socket: 'Socket / peer (OS user)',
  password: 'User & password',
  none: 'No authentication'
};

export interface FormState {
  id?: string;
  name: string;
  engine: string;
  locationKind: 'host' | 'container';
  container: string;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  auth: DbAuth;
  allowWrite: boolean;
  hasPassword?: boolean;
}

export const emptyForm = (engine: DbEngine): FormState => ({
  name: '', engine: engine.id, locationKind: 'host', container: '', host: '', port: engine.defaultPort ? String(engine.defaultPort) : '',
  user: '', password: '', database: '', auth: engine.authModes[0], allowWrite: false
});



interface ConnectionFormProps {
  form: FormState;
  setForm: (f: FormState | null) => void;
  engines: DbEngine[];
  error: string | null;
  onSave: () => void;
}

export default function ConnectionForm({ form, setForm, engines, error, onSave }: ConnectionFormProps) {
  const t = useT();
  const engineOf = (id: string) => engines.find((e) => e.id === id);
  const formEngine = engineOf(form.engine);
  if (!formEngine) return null;
  const saveForm = onSave;

  const authLabel = (a: DbAuth) => {
    switch (a) {
      case 'container-env':
        return t('db.authContainerEnv');
      case 'socket':
        return t('db.authSocket');
      case 'password':
        return t('db.authPassword');
      case 'none':
        return t('db.authNone');
      default:
        return a;
    }
  };

  return (
    <Modal isOpen={!!form} onClose={() => setForm(null)} className="max-w-md">
      <div
        className="w-full bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-xl p-4 space-y-3 text-xs max-h-[90vh] overflow-auto shadow-2xl"
        role="dialog"
        aria-label="Database Connection"
      >
        <div className="flex items-center">
          <h3 className="text-sm font-semibold flex-1">{form.id ? t('db.editConn') : t('db.newConn')}</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setForm(null)}
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        <label className="block space-y-1">
          <span>Engine</span>
          <select
            value={form.engine}
            disabled={!!form.id}
            onChange={(e) => {
              const en = engineOf(e.target.value)!;
              setForm({ ...emptyForm(en), name: form.name });
            }}
            className="w-full h-8 bg-[var(--background)] border border-[var(--border)] rounded px-2"
          >
            {engines.map((en) => (
              <option key={en.id} value={en.id}>
                {en.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span>Name</span>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={formEngine.label}
            className="h-8 text-xs"
          />
        </label>
        <fieldset className="space-y-1">
          <legend className="mb-1">{t('db.clientLocation')}</legend>
          <div className="flex gap-3">
            {(['host', 'container'] as const).map((k) => (
              <label key={k} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="loc"
                  checked={form.locationKind === k}
                  onChange={() => setForm({ ...form, locationKind: k })}
                />
                {k === 'host' ? t('db.onHost') : t('db.inContainer')}
              </label>
            ))}
          </div>
          {form.locationKind === 'container' && (
            <Input
              value={form.container}
              onChange={(e) => setForm({ ...form, container: e.target.value })}
              placeholder="container name, e.g. app-mysql"
              className="h-8 text-xs font-mono"
            />
          )}
        </fieldset>
        <label className="block space-y-1">
          <span>{t('db.authMethod')}</span>
          <select
            value={form.auth}
            onChange={(e) => setForm({ ...form, auth: e.target.value as DbAuth })}
            className="w-full h-8 bg-[var(--background)] border border-[var(--border)] rounded px-2"
          >
            {formEngine.authModes
              .filter((a) => a !== 'container-env' || form.locationKind === 'container')
              .map((a) => (
                <option key={a} value={a}>
                  {authLabel(a)}
                </option>
              ))}
          </select>
        </label>
        {formEngine.fields.includes('host') && form.auth !== 'socket' && form.auth !== 'container-env' && (
          <div className="grid grid-cols-[1fr,90px] gap-2">
            <label className="block space-y-1">
              <span>Host</span>
              <Input
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder="127.0.0.1"
                className="h-8 text-xs font-mono sensitive"
              />
            </label>
            <label className="block space-y-1">
              <span>Port</span>
              <Input
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value.replace(/\D/g, '') })}
                className="h-8 text-xs font-mono"
              />
            </label>
          </div>
        )}
        {formEngine.fields.includes('user') && form.auth !== 'container-env' && form.auth !== 'none' && (
          <label className="block space-y-1">
            <span>
              User {form.auth === 'socket' && <span className="text-[var(--muted-foreground)]">(OS / DB user)</span>}
            </span>
            <Input
              value={form.user}
              onChange={(e) => setForm({ ...form, user: e.target.value })}
              className="h-8 text-xs font-mono"
            />
          </label>
        )}
        {formEngine.fields.includes('password') && form.auth === 'password' && (
          <label className="block space-y-1">
            <span>
              Password {form.hasPassword && <span className="text-emerald-500">{t('db.savedEncrypted')}</span>}
            </span>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={form.hasPassword ? t('db.passPlaceholder') : ''}
              className="h-8 text-xs font-mono"
            />
          </label>
        )}
        {formEngine.fields.includes('database') && (
          <label className="block space-y-1">
            <span>{form.engine === 'sqlite' ? t('db.sqlitePath') : t('db.defaultDb')}</span>
            <Input
              value={form.database}
              onChange={(e) => setForm({ ...form, database: e.target.value })}
              placeholder={form.engine === 'sqlite' ? '/var/www/app/database.sqlite' : ''}
              className="h-8 text-xs font-mono"
            />
          </label>
        )}
        <label
          className={`flex items-start gap-2 p-2 rounded border ${
            form.allowWrite ? 'border-amber-500/40 bg-amber-500/10' : 'border-[var(--border)]'
          }`}
        >
          <input
            type="checkbox"
            checked={form.allowWrite}
            onChange={(e) => setForm({ ...form, allowWrite: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            <b>{t('db.allowWrite')}</b>
            <span className="block text-[10px] text-[var(--muted-foreground)]">{t('db.readOnlyNotice')}</span>
          </span>
        </label>
        {error && (
          <p role="alert" className="text-red-500">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setForm(null)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={saveForm}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
