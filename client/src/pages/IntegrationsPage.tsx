import React, { useEffect, useState } from 'react';
import {
  FolderGit2, CheckCircle2, ExternalLink, RefreshCw,
  Trash2, Shield, GitBranch, Zap, X, Lock
} from 'lucide-react';
import {
  fetchGitIntegrations,
  deleteGitIntegration,
  connectGitViaToken
} from '@/features/git/api';
import type { SafeGitIntegration } from '@/features/git/types';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { confirmModal } from '@/shared/ui/confirm-dialog';
import { useT } from '@/shared/i18n';

export default function IntegrationsPage() {
  const t = useT();
  const [integrations, setIntegrations] = useState<SafeGitIntegration[]>([]);
  const [loading, setLoading] = useState(true);

  // Connect dialog state (PAT only)
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [patToken, setPatToken] = useState('');
  const [submittingToken, setSubmittingToken] = useState(false);

  const GITHUB_PAT_URL = 'https://github.com/settings/tokens/new?scopes=repo,read:user,admin:repo_hook&description=7Server+Control+Panel';

  const loadData = async () => {
    try {
      setLoading(true);
      const ints = await fetchGitIntegrations();
      setIntegrations(ints);
    } catch (err: any) {
      toast.error(err.message || t('integrations.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConnectToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patToken.trim()) {
      toast.error(t('integrations.patRequired'));
      return;
    }

    try {
      setSubmittingToken(true);
      const saved = await connectGitViaToken(patToken.trim());
      toast.success(t('integrations.tokenConnected', { username: saved.username }));
      setPatToken('');
      setShowConnectModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || t('integrations.invalidToken'));
    } finally {
      setSubmittingToken(false);
    }
  };

  const handleDisconnect = async (integration: SafeGitIntegration) => {
    const ok = await confirmModal({
      title: t('integrations.disconnectTitle'),
      message: t('integrations.disconnectConfirm', { username: integration.username }),
      variant: 'danger',
      confirmText: t('common.delete')
    });

    if (!ok) return;

    try {
      await deleteGitIntegration(integration.id);
      toast.success(t('integrations.disconnectedSuccess'));
      loadData();
    } catch (err: any) {
      toast.error(err.message || t('integrations.disconnectFailed'));
    }
  };

  const githubIntegration = integrations.find((i) => i.provider === 'github');

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground)]">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)] flex items-center gap-2">
                {t('integrations.title')}
              </h1>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('integrations.subtitle')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!githubIntegration && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowConnectModal(true)}
              className="gap-1.5 h-8 text-xs"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>{t('integrations.connectGitHub')}</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-1.5 h-8 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('common.refresh')}</span>
          </Button>
        </div>
      </div>

      {/* Scope Banner */}
      <div className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/50 text-xs flex items-center gap-3">
        <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
        <span className="text-[var(--muted-foreground)] leading-relaxed">
          {t('integrations.globalScope')}
        </span>
      </div>

      {/* Provider Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* GitHub Card */}
        <Card className="p-5 flex flex-col justify-between border-[var(--border)] relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-black text-white dark:bg-white dark:text-black flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">GitHub</h3>
                  <p className="text-[11px] text-[var(--muted-foreground)]">{t('integrations.githubSub')}</p>
                </div>
              </div>

              {githubIntegration ? (
                <Badge variant="success" className="text-[10px] gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {t('integrations.connected')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  {t('integrations.notConnected')}
                </Badge>
              )}
            </div>

            {githubIntegration ? (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--muted)]/50 border border-[var(--border)]">
                  <img
                    src={githubIntegration.avatar_url}
                    alt={githubIntegration.username}
                    className="w-10 h-10 rounded-full border border-[var(--border)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[var(--foreground)] truncate">
                      {githubIntegration.display_name || githubIntegration.username}
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)] font-mono">
                      @{githubIntegration.username}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-[var(--muted-foreground)] space-y-1">
                  <div className="flex justify-between">
                    <span>{t('integrations.scopes')}</span>
                    <span className="font-mono text-[var(--foreground)]">{githubIntegration.scopes.join(', ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('integrations.connectedSince')}</span>
                    <span>{new Date(githubIntegration.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[var(--muted-foreground)] space-y-2 pt-1">
                <p>
                  {t('integrations.githubDesc')}
                </p>
                <div className="p-2.5 rounded bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-[11px] flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <span>{t('integrations.patSupported')}</span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-5 border-t border-[var(--border)] mt-4">
            {githubIntegration ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDisconnect(githubIntegration)}
                className="w-full text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('integrations.disconnect')}</span>
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowConnectModal(true)}
                className="w-full text-xs gap-1.5"
              >
                <FolderGit2 className="w-3.5 h-3.5" />
                <span>{t('integrations.connectGitHub')}</span>
              </Button>
            )}
          </div>
        </Card>

        {/* GitLab Card */}
        <Card className="p-5 flex flex-col justify-between border-[var(--border)] opacity-60">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#FC6D26] text-white flex items-center justify-center shrink-0">
                  <GitBranch className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">GitLab</h3>
                  <p className="text-[11px] text-[var(--muted-foreground)]">{t('integrations.gitlabSub')}</p>
                </div>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {t('integrations.comingSoon')}
              </Badge>
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              {t('integrations.gitlabDesc')}
            </p>
          </div>
          <div className="pt-5 border-t border-[var(--border)] mt-4">
            <Button variant="outline" size="sm" disabled className="w-full text-xs">
              {t('integrations.comingSoon')}
            </Button>
          </div>
        </Card>

        {/* Bitbucket Card */}
        <Card className="p-5 flex flex-col justify-between border-[var(--border)] opacity-60">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#0052CC] text-white flex items-center justify-center shrink-0">
                  <GitBranch className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">Bitbucket</h3>
                  <p className="text-[11px] text-[var(--muted-foreground)]">{t('integrations.bitbucketSub')}</p>
                </div>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {t('integrations.comingSoon')}
              </Badge>
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              {t('integrations.bitbucketDesc')}
            </p>
          </div>
          <div className="pt-5 border-t border-[var(--border)] mt-4">
            <Button variant="outline" size="sm" disabled className="w-full text-xs">
              {t('integrations.comingSoon')}
            </Button>
          </div>
        </Card>
      </div>

      {/* Connect GitHub Modal (PAT Streamlined) */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--card)] border border-[var(--border)] metal rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl text-[var(--foreground)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-[var(--foreground)]" />
                <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('integrations.connectGitHub')}</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowConnectModal(false)}
                className="h-7 w-7 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleConnectToken} className="space-y-4 pt-1">
              <div className="p-3.5 rounded-lg bg-[var(--muted)]/50 border border-[var(--border)] text-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--foreground)]">{t('integrations.patBestFor')}</span>
                  <Badge variant="success" className="text-[9px]">{t('integrations.zeroConfig')}</Badge>
                </div>
                <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                  {t('integrations.patNoDomain')}
                </p>
                <a
                  href={GITHUB_PAT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-medium text-xs shadow-xs hover:opacity-90 transition"
                >
                  <span>{t('integrations.generateTokenGithub')}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <p className="text-[11px] text-[var(--muted-foreground)] pt-1">
                  {t('integrations.copyTokenInstruction')}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                  {t('integrations.patLabel')} <span className="text-red-500">*</span>
                </label>
                <Input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={patToken}
                  onChange={(e) => setPatToken(e.target.value)}
                  className="h-8 text-xs font-mono"
                  required
                />
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)] mt-1.5">
                  <Lock className="w-3 h-3 text-emerald-500" />
                  <span>{t('integrations.patEncryptedNotice')}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConnectModal(false)}
                  className="text-xs"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  variant="default"
                  disabled={submittingToken}
                  className="text-xs gap-1.5"
                >
                  {submittingToken ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('integrations.verifying')}</span>
                    </>
                  ) : (
                    <span>{t('integrations.saveAndConnect')}</span>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
