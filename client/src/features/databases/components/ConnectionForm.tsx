import React from 'react';
import { X } from 'lucide-react';
import { DbEngine, DbAuth } from '@/features/databases/api';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

export const AUTH_LABEL: Record<DbAuth, string> = {
  'container-env': 'Kredensial dari env container',
  socket: 'Socket / peer (user OS)',
  password: 'User & password',
  none: 'Tanpa auth'
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
  const engineOf = (id: string) => engines.find((e) => e.id === id);
  const formEngine = engineOf(form.engine);
  if (!formEngine) return null;
  const saveForm = onSave;
  return (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-md bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-xl p-4 space-y-3 text-xs max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Koneksi database">
            <div className="flex items-center">
              <h3 className="text-sm font-semibold flex-1">{form.id ? 'Ubah koneksi' : 'Koneksi baru'}</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setForm(null)} aria-label="Tutup"><X className="w-4 h-4" /></Button>
            </div>
            <label className="block space-y-1">
              <span>Engine</span>
              <select value={form.engine} disabled={!!form.id}
                onChange={(e) => { const en = engineOf(e.target.value)!; setForm({ ...emptyForm(en), name: form.name }); }}
                className="w-full h-8 bg-[var(--background)] border border-[var(--border)] rounded px-2">
                {engines.map((en) => <option key={en.id} value={en.id}>{en.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span>Nama</span>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={formEngine.label} className="h-8 text-xs" />
            </label>
            <fieldset className="space-y-1">
              <legend className="mb-1">Lokasi klien</legend>
              <div className="flex gap-3">
                {(['host', 'container'] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <input type="radio" name="loc" checked={form.locationKind === k} onChange={() => setForm({ ...form, locationKind: k })} />
                    {k === 'host' ? 'Langsung di server' : 'Di container Docker'}
                  </label>
                ))}
              </div>
              {form.locationKind === 'container' && (
                <Input value={form.container} onChange={(e) => setForm({ ...form, container: e.target.value })} placeholder="nama container, mis. app-mysql" className="h-8 text-xs font-mono" />
              )}
            </fieldset>
            <label className="block space-y-1">
              <span>Cara login</span>
              <select value={form.auth} onChange={(e) => setForm({ ...form, auth: e.target.value as DbAuth })} className="w-full h-8 bg-[var(--background)] border border-[var(--border)] rounded px-2">
                {formEngine.authModes.filter((a) => a !== 'container-env' || form.locationKind === 'container').map((a) => <option key={a} value={a}>{AUTH_LABEL[a]}</option>)}
              </select>
            </label>
            {formEngine.fields.includes('host') && form.auth !== 'socket' && form.auth !== 'container-env' && (
              <div className="grid grid-cols-[1fr,90px] gap-2">
                <label className="block space-y-1"><span>Host</span><Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="127.0.0.1" className="h-8 text-xs font-mono sensitive" /></label>
                <label className="block space-y-1"><span>Port</span><Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value.replace(/\D/g, '') })} className="h-8 text-xs font-mono" /></label>
              </div>
            )}
            {formEngine.fields.includes('user') && form.auth !== 'container-env' && form.auth !== 'none' && (
              <label className="block space-y-1"><span>User {form.auth === 'socket' && <span className="text-[var(--muted-foreground)]">(user OS / DB)</span>}</span>
                <Input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} className="h-8 text-xs font-mono" /></label>
            )}
            {formEngine.fields.includes('password') && form.auth === 'password' && (
              <label className="block space-y-1"><span>Password {form.hasPassword && <span className="text-emerald-500">(tersimpan, terenkripsi)</span>}</span>
                <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={form.hasPassword ? 'Kosongkan untuk tetap pakai yang lama' : ''} className="h-8 text-xs font-mono" /></label>
            )}
            {formEngine.fields.includes('database') && (
              <label className="block space-y-1"><span>{form.engine === 'sqlite' ? 'Path file database' : 'Database default (opsional)'}</span>
                <Input value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} placeholder={form.engine === 'sqlite' ? '/var/www/app/database.sqlite' : ''} className="h-8 text-xs font-mono" /></label>
            )}
            <label className={`flex items-start gap-2 p-2 rounded border ${form.allowWrite ? 'border-amber-500/40 bg-amber-500/10' : 'border-[var(--border)]'}`}>
              <input type="checkbox" checked={form.allowWrite} onChange={(e) => setForm({ ...form, allowWrite: e.target.checked })} className="mt-0.5" />
              <span>
                <b>Izinkan query yang mengubah data</b> (INSERT/UPDATE/DELETE/DDL)
                <span className="block text-[10px] text-[var(--muted-foreground)]">Default mati. Saat mati, session dikunci read-only{formEngine.readOnlyEnforced === 'statement' ? ' lewat daftar perintah yang diizinkan' : ' oleh database itu sendiri'}.</span>
              </span>
            </label>
            {error && <p role="alert" className="text-red-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setForm(null)}>Batal</Button>
              <Button size="sm" onClick={saveForm}>Simpan</Button>
            </div>
          </div>
        </div>
  );
}
