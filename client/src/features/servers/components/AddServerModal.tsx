import React, { useState } from 'react';
import { X, Server, Key, ShieldCheck, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { testConnection } from '@/features/servers/api';
import { ServerItem } from '@/features/servers/types';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Modal } from '@/shared/ui/modal';
import { toast } from '@/shared/ui/toast';
import { useT } from '@/shared/i18n';

interface AddServerModalProps {
  server: ServerItem | null;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}

export default function AddServerModal({ server, onSave, onClose }: AddServerModalProps) {
  const t = useT();
  const isEditing = !!server;

  const [formData, setFormData] = useState({
    name: server?.name || '',
    host: server?.host || '',
    port: server?.port || 22,
    username: server?.username || 'root',
    authType: server?.authType || 'password',
    password: '',
    privateKey: '',
    passphrase: '',
    sudoPassword: '',
    tags: server?.tags ? server.tags.join(', ') : '',
    description: server?.description || ''
  });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!formData.host) {
      toast.warning(t('addServer.hostFirst'));
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testConnection(formData);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.host) {
      toast.warning(t('addServer.hostRequired'));
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...formData,
        port: parseInt(String(formData.port), 10) || 22,
        name: formData.name.trim() || formData.host.trim()
      });
      toast.success(isEditing ? t('addServer.saved') : t('addServer.added'));
      onClose();
    } catch (err: any) {
      toast.error(t('addServer.saveFailed', { error: err.message }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded-md bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-xs text-zinc-100">
                {isEditing ? t('addServer.modalTitleEdit') : t('addServer.modalTitleAdd')}
              </h2>
              <p className="text-[11px] text-zinc-500">{t('addServer.modalSubtitle')}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t('common.close')}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">{t('addServer.labelName')}</label>
            <Input
              type="text"
              name="name"
              placeholder={t('addServer.placeholderName')}
              value={formData.name}
              onChange={handleChange}
              className="font-sans"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                {t('addServer.labelHost')} <span className="text-red-400">*</span>
              </label>
              <Input
                type="text"
                name="host"
                required
                placeholder={t('addServer.placeholderHost')}
                value={formData.host}
                className="sensitive"
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">{t('addServer.labelPort')}</label>
              <Input
                type="number"
                name="port"
                value={formData.port}
                onChange={handleChange}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">{t('addServer.labelUsername')}</label>
            <Input
              type="text"
              name="username"
              placeholder="root"
              value={formData.username}
              onChange={handleChange}
            />
          </div>

          {/* Authentication Selection */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">{t('addServer.labelAuthMethod')}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData((p) => ({ ...p, authType: 'password' }))}
                className={`py-1.5 text-xs font-medium rounded-md border flex items-center justify-center gap-2 transition ${
                  formData.authType === 'password'
                    ? 'bg-zinc-100 text-zinc-950 border-zinc-200'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                {t('addServer.authPassword')}
              </button>
              <button
                type="button"
                onClick={() => setFormData((p) => ({ ...p, authType: 'key' }))}
                className={`py-1.5 text-xs font-medium rounded-md border flex items-center justify-center gap-2 transition ${
                  formData.authType === 'key'
                    ? 'bg-zinc-100 text-zinc-950 border-zinc-200'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {t('addServer.authKey')}
              </button>
            </div>
          </div>

          {formData.authType === 'password' ? (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                {t('addServer.labelPassword')} {isEditing && <span className="text-zinc-500 font-normal">{t('addServer.labelPasswordBlank')}</span>}
              </label>
              <Input
                type="password"
                name="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  {t('addServer.labelPrivateKey')}
                  {isEditing && <span className="text-zinc-500 font-normal"> {t('addServer.labelPasswordBlank')}</span>}
                </label>
                <textarea
                  name="privateKey"
                  rows={4}
                  placeholder={t('addServer.placeholderPrivateKey')}
                  value={formData.privateKey}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">{t('addServer.labelPassphrase')}</label>
                <Input
                  type="password"
                  name="passphrase"
                  placeholder={t('addServer.placeholderPassphrase')}
                  value={formData.passphrase}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Sudo Password (Optional)
                  {server?.hasSudoPassword && (
                    <span className="text-emerald-400 font-normal ml-1.5 text-[11px]">✓ Sudo password saved</span>
                  )}
                </label>
                <Input
                  type="password"
                  name="sudoPassword"
                  placeholder={server?.hasSudoPassword ? '••••••••' : 'Enter sudo password if user requires it'}
                  value={formData.sudoPassword}
                  onChange={handleChange}
                />
                <span className="text-[10px] text-zinc-500 mt-0.5 block">
                  Enables 1-click package installs and service restarts for non-root sudo users.
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">{t('addServer.labelTags')}</label>
            <Input
              type="text"
              name="tags"
              placeholder={t('addServer.placeholderTags')}
              value={formData.tags}
              onChange={handleChange}
              className="font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">{t('addServer.labelNotes')}</label>
            <Input
              type="text"
              name="description"
              placeholder={t('addServer.placeholderNotes')}
              value={formData.description}
              onChange={handleChange}
              className="font-sans"
            />
          </div>

          {testResult && (
            <div
              className={`p-2.5 rounded-lg text-xs flex items-center gap-2 font-mono ${
                testResult.success
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}
            >
              {testResult.success ? (
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between border-t border-zinc-800/80">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing}
              className="gap-1.5"
            >
              {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3 text-zinc-400" />}
              {testing ? t('addServer.testing') : t('addServer.testConnection')}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={saving}
              >
                {saving ? t('addServer.saving') : isEditing ? t('addServer.saveChanges') : t('addServer.addNode')}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
