// Step 1 of the deploy wizard: GitHub account check + grouped, filterable repository list.
import React, { useState, useMemo } from 'react';
import { FolderGit2, GitBranch, ArrowRight, Search, Lock, Globe, ExternalLink, RefreshCw, Zap, Building2, User, ChevronDown, ChevronRight, Users, Code2, Calendar } from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { toast } from '@/shared/ui/toast';
import { useT } from '@/shared/i18n';
import type { SafeGitIntegration, NormalizedRepo } from '@/features/git/types';
import { fetchGitIntegrations, fetchGitHubRepos, connectGitViaToken } from '@/features/git/api';


function RepoGridSkeleton() {
  return (
    <div className="space-y-4">
      {[4, 2].map((count, gIdx) => (
        <div key={gIdx} className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card)]">
          <div className="px-4 py-3 bg-[var(--muted)]/50 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Skeleton className="w-6 h-6 rounded-full" />
              <Skeleton className="w-32 h-4 rounded" />
              <Skeleton className="w-16 h-4 rounded" />
            </div>
            <Skeleton className="w-20 h-4 rounded" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
            {Array.from({ length: count }, (_, rIdx) => (
              <div key={rIdx} className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)]/40 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <div className="space-y-1.5">
                      <Skeleton className="w-32 h-3.5 rounded" />
                      <Skeleton className="w-20 h-2.5 rounded" />
                    </div>
                  </div>
                  <Skeleton className="w-20 h-7 rounded-md" />
                </div>
                <Skeleton className="w-full h-3 rounded" />
                <div className="flex items-center gap-3 pt-1">
                  <Skeleton className="w-16 h-3 rounded" />
                  <Skeleton className="w-14 h-3 rounded" />
                  <Skeleton className="w-20 h-3 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Repo list state; owned by the wizard so the list survives going back from step 2. */
export function useRepoPicker() {
  const t = useT();
  // Integrations & Repos
  const [integrations, setIntegrations] = useState<SafeGitIntegration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [repos, setRepos] = useState<NormalizedRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [repoTypeFilter, setRepoTypeFilter] = useState<'all' | 'public' | 'private'>('all');
  const [selectedOwner, setSelectedOwner] = useState<string>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [collapsedOwners, setCollapsedOwners] = useState<Record<string, boolean>>({});
  const [inlineToken, setInlineToken] = useState('');
  const [connectingToken, setConnectingToken] = useState(false);


  const loadReposList = async () => {
    try {
      setLoadingIntegrations(true);
      const ints = await fetchGitIntegrations();
      setIntegrations(ints);

      if (ints.length > 0) {
        setLoadingRepos(true);
        const repoList = await fetchGitHubRepos();
        setRepos(repoList);
      }
    } catch (err: any) {
      toast.error(err.message || t('gitApp.loadRepoError'));
    } finally {
      setLoadingIntegrations(false);
      setLoadingRepos(false);
    }
  };


  const handleInlineConnectToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineToken.trim()) return;

    try {
      setConnectingToken(true);
      const saved = await connectGitViaToken(inlineToken.trim());
      setIntegrations([saved]);
      toast.success(t('integrations.tokenConnected', { username: saved.username }));

      setLoadingRepos(true);
      const repoList = await fetchGitHubRepos();
      setRepos(repoList);
    } catch (err: any) {
      toast.error(err.message || t('integrations.invalidToken'));
    } finally {
      setConnectingToken(false);
      setLoadingRepos(false);
    }
  };

  const toggleOwnerCollapse = (owner: string) => {
    setCollapsedOwners((prev) => ({ ...prev, [owner]: !prev[owner] }));
  };

  // Extract distinct owners & count
  const ownerStats = useMemo(() => {
    const map = new Map<string, { owner: string; avatar_url?: string; type?: string; count: number }>();
    for (const r of repos) {
      const o = r.owner?.login || r.full_name.split('/')[0] || 'other';
      const existing = map.get(o) || {
        owner: o,
        avatar_url: r.owner?.avatar_url,
        type: r.owner?.type,
        count: 0
      };
      existing.count += 1;
      map.set(o, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [repos]);

  // Extract distinct languages & count
  const languageStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of repos) {
      if (r.language) {
        map.set(r.language, (map.get(r.language) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([lang, count]) => ({ lang, count }))
      .sort((a, b) => b.count - a.count);
  }, [repos]);

  // Filter repos by search, type, owner, and language
  const filteredRepos = useMemo(() => {
    return repos.filter((r) => {
      const ownerName = r.owner?.login || r.full_name.split('/')[0] || '';
      if (selectedOwner !== 'all' && ownerName !== selectedOwner) return false;
      if (selectedLanguage !== 'all' && r.language !== selectedLanguage) return false;
      if (repoTypeFilter === 'public' && r.private) return false;
      if (repoTypeFilter === 'private' && !r.private) return false;
      if (!repoSearch.trim()) return true;
      const q = repoSearch.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.full_name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
      );
    });
  }, [repos, selectedOwner, selectedLanguage, repoTypeFilter, repoSearch]);

  // Group filtered repos by owner
  const groupedRepos = useMemo(() => {
    const map = new Map<string, {
      owner: string;
      avatar_url?: string;
      type?: string;
      repos: NormalizedRepo[];
    }>();

    for (const r of filteredRepos) {
      const o = r.owner?.login || r.full_name.split('/')[0] || 'other';
      if (!map.has(o)) {
        map.set(o, {
          owner: o,
          avatar_url: r.owner?.avatar_url,
          type: r.owner?.type,
          repos: []
        });
      }
      map.get(o)!.repos.push(r);
    }

    return Array.from(map.values());
  }, [filteredRepos]);


  return {
    integrations, loadingIntegrations, repos, loadingRepos, repoSearch, setRepoSearch, repoTypeFilter, setRepoTypeFilter,
    selectedOwner, setSelectedOwner, selectedLanguage, setSelectedLanguage, collapsedOwners, inlineToken, setInlineToken,
    connectingToken, loadReposList, handleInlineConnectToken, toggleOwnerCollapse, ownerStats, languageStats, filteredRepos, groupedRepos
  };
}

export function RepoPicker({
  picker,
  onSelectRepo: handleSelectRepo,
  onOpenIntegrations
}: {
  picker: ReturnType<typeof useRepoPicker>;
  onSelectRepo: (repo: NormalizedRepo) => void;
  onOpenIntegrations?: () => void;
}) {
  const t = useT();
  const {
    integrations, loadingIntegrations, loadingRepos, repos, repoSearch, setRepoSearch, repoTypeFilter, setRepoTypeFilter,
    selectedOwner, setSelectedOwner, selectedLanguage, setSelectedLanguage, collapsedOwners, inlineToken, setInlineToken,
    connectingToken, loadReposList, handleInlineConnectToken, toggleOwnerCollapse, ownerStats, languageStats, filteredRepos, groupedRepos
  } = picker;

  return (
    <>
      {integrations.length === 0 && !loadingIntegrations ? (
        <Card className="p-8 max-w-xl mx-auto space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground)] mx-auto">
              <BrandIcon name="github" className="w-6 h-6" fallback={<FolderGit2 className="w-6 h-6" />} />
            </div>
            <h3 className="text-base font-bold text-[var(--foreground)]">{t('integrations.connectGitHub')}</h3>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed max-w-md mx-auto">
              {t('integrations.patNoDomain')}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--foreground)]">{t('integrations.patBestFor')}</span>
              <Badge variant="success" className="text-[9px]">{t('integrations.zeroConfig')}</Badge>
            </div>
            <a
              href="https://github.com/settings/tokens/new?scopes=repo,read:user,admin:repo_hook&description=7Server+Control+Panel"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-medium text-xs shadow-xs hover:opacity-90 transition"
            >
              <span>{t('integrations.generateTokenGithub')}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              {t('integrations.copyTokenInstruction')}
            </p>
          </div>

          <form onSubmit={handleInlineConnectToken} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                {t('integrations.patLabel')}:
              </label>
              <Input
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={inlineToken}
                onChange={(e) => setInlineToken(e.target.value)}
                className="h-9 text-xs font-mono"
                required
              />
            </div>

            <Button
              type="submit"
              variant="default"
              disabled={connectingToken}
              className="w-full h-9 text-xs gap-1.5"
            >
              <Zap className={`w-3.5 h-3.5 text-amber-500 ${connectingToken ? 'animate-spin' : ''}`} />
              <span>{connectingToken ? t('gitApp.connectingToken') : t('gitApp.connectAndLoad')}</span>
            </Button>
          </form>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT SIDEBAR: ACCOUNTS, STACK & VISIBILITY FILTERS */}
          <div className="lg:col-span-3 space-y-4">
            {/* Accounts & Orgs Card */}
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  {t('gitApp.accountsHeader')}
                </span>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {ownerStats.length}
                </Badge>
              </div>

              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setSelectedOwner('all')}
                  className={`w-full px-2.5 py-2 rounded-lg text-xs font-medium transition flex items-center justify-between ${
                    selectedOwner === 'all'
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs'
                      : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t('gitApp.allOwners')}</span>
                  </div>
                  <span className="text-[10px] font-mono opacity-75">{repos.length}</span>
                </button>

                {ownerStats.map((os) => {
                  const isActive = selectedOwner === os.owner;
                  return (
                    <button
                      key={os.owner}
                      type="button"
                      onClick={() => setSelectedOwner(os.owner)}
                      className={`w-full px-2.5 py-2 rounded-lg text-xs font-medium transition flex items-center justify-between ${
                        isActive
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs'
                          : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {os.avatar_url ? (
                          <img src={os.avatar_url} alt={os.owner} className="w-4 h-4 rounded-full shrink-0" />
                        ) : os.type === 'Organization' ? (
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <User className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span className="truncate font-mono">{os.owner}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-75">{os.count}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Tech Stack / Language Filter Card */}
            {languageStats.length > 0 && (
              <Card className="p-4 space-y-3">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  {t('gitApp.languagesHeader')}
                </span>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedLanguage('all')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition border ${
                      selectedLanguage === 'all'
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent'
                        : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
                    }`}
                  >
                    {t('gitApp.allLanguages')}
                  </button>

                  {languageStats.map(({ lang, count }) => {
                    const active = selectedLanguage === lang;
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setSelectedLanguage(active ? 'all' : lang)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition border flex items-center gap-1.5 ${
                          active
                            ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent'
                            : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
                        }`}
                      >
                        <BrandIcon
                          name={lang}
                          mono={active}
                          className="w-3 h-3"
                          fallback={<Code2 className="w-3 h-3" />}
                        />
                        <span>{lang}</span>
                        <span className="opacity-60 font-mono text-[10px]">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Visibility Filter Card */}
            <Card className="p-4 space-y-3">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                {t('gitApp.visibilityHeader')}
              </span>
              <div className="grid grid-cols-3 gap-1 bg-[var(--muted)] p-1 rounded-lg border border-[var(--border)]">
                {[
                  { key: 'all', label: t('gitApp.filterAll') },
                  { key: 'public', label: t('gitApp.filterPublic') },
                  { key: 'private', label: t('gitApp.filterPrivate') }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRepoTypeFilter(key as any)}
                    className={`py-1.5 px-2 rounded-md text-[11px] font-medium capitalize transition ${
                      repoTypeFilter === key
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* RIGHT MAIN AREA: SEARCH & REPOSITORY CARDS GRID */}
          <div className="lg:col-span-9 space-y-4">
            {/* Search Bar */}
            <Card className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <Input
                  type="text"
                  placeholder={t('gitApp.searchRepo')}
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  className="pl-9 h-8 text-xs bg-[var(--background)]"
                />
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3">
                <span className="text-[11px] text-[var(--muted-foreground)] font-mono">
                  {t('gitApp.showingRepos', { filtered: filteredRepos.length, total: repos.length })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadReposList}
                  disabled={loadingRepos}
                  className="h-8 gap-1.5 text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRepos ? 'animate-spin' : ''}`} />
                  <span>{t('common.refresh')}</span>
                </Button>
              </div>
            </Card>

            {/* Repo Cards Grid or Skeleton */}
            {loadingRepos || loadingIntegrations ? (
              <RepoGridSkeleton />
            ) : filteredRepos.length === 0 ? (
              <Card className="text-center py-16 px-4 text-xs text-[var(--muted-foreground)] space-y-2">
                <FolderGit2 className="w-8 h-8 mx-auto opacity-30" />
                <p className="font-semibold text-[var(--foreground)]">{t('gitApp.noRepos')}</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {groupedRepos.map((group) => {
                  const isCollapsed = Boolean(collapsedOwners[group.owner]);
                  return (
                    <div
                      key={group.owner}
                      className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card)] shadow-xs transition"
                    >
                      {/* Owner Group Header */}
                      <div
                        onClick={() => toggleOwnerCollapse(group.owner)}
                        className="px-4 py-3 bg-[var(--muted)]/50 border-b border-[var(--border)] flex items-center justify-between cursor-pointer select-none hover:bg-[var(--muted)] transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-[var(--muted-foreground)]">
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </span>

                          {group.avatar_url ? (
                            <img
                              src={group.avatar_url}
                              alt={group.owner}
                              className="w-6 h-6 rounded-full border border-[var(--border)]"
                            />
                          ) : group.type === 'Organization' ? (
                            <div className="w-6 h-6 rounded-md bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground)]">
                              <Building2 className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-md bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground)]">
                              <User className="w-3.5 h-3.5" />
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs font-mono text-[var(--foreground)]">
                              {group.owner}
                            </span>
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-normal">
                              {group.type === 'Organization' ? t('gitApp.orgAccount') : t('gitApp.personalAccount')}
                            </Badge>
                          </div>
                        </div>

                        <Badge variant="outline" className="text-[10px] font-mono">
                          {t('gitApp.reposCount', { count: group.repos.length })}
                        </Badge>
                      </div>

                      {/* 2-Column Cards Grid inside each Owner Group */}
                      {!isCollapsed && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
                          {group.repos.map((repo) => (
                            <div
                              key={repo.id}
                              className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)]/40 hover:bg-[var(--muted)]/40 hover:border-[var(--primary)]/40 transition flex flex-col justify-between gap-3 group"
                            >
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center shrink-0">
                                      <BrandIcon
                                        name={repo.language || 'git'}
                                        className="w-4 h-4"
                                        fallback={<FolderGit2 className="w-4 h-4 text-[var(--muted-foreground)]" />}
                                      />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-semibold text-xs text-[var(--foreground)] truncate">
                                          {repo.name}
                                        </span>
                                        {repo.private ? (
                                          <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0">
                                            <Lock className="w-2.5 h-2.5" /> Private
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-[9px] gap-0.5 px-1.5 py-0">
                                            <Globe className="w-2.5 h-2.5" /> Public
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-[var(--muted-foreground)] font-mono truncate">
                                        {repo.full_name}
                                      </div>
                                    </div>
                                  </div>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleSelectRepo(repo)}
                                    className="h-7 text-xs gap-1 group-hover:bg-[var(--primary)] group-hover:text-[var(--primary-foreground)] group-hover:border-transparent transition shrink-0"
                                  >
                                    <span>{t('gitApp.import')}</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </Button>
                                </div>

                                <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-2 min-h-[2rem] leading-relaxed">
                                  {repo.description || t('gitApp.noDescription')}
                                </p>
                              </div>

                              {/* Metadata Footer */}
                              <div className="pt-2 border-t border-[var(--border)]/60 flex items-center justify-between gap-2 text-[10px] text-[var(--muted-foreground)] font-mono">
                                <div className="flex items-center gap-3 flex-wrap">
                                  {repo.language && (
                                    <span className="inline-flex items-center gap-1 text-[var(--foreground)]">
                                      <BrandIcon name={repo.language} className="w-3 h-3" />
                                      {repo.language}
                                    </span>
                                  )}
                                  <span className="inline-flex items-center gap-1">
                                    <GitBranch className="w-3 h-3" />
                                    {repo.default_branch}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  {repo.updated_at && (
                                    <span className="inline-flex items-center gap-1">
                                      <Calendar className="w-2.5 h-2.5" />
                                      {new Date(repo.updated_at).toLocaleDateString()}
                                    </span>
                                  )}
                                  <a
                                    href={repo.html_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="hover:text-[var(--foreground)] p-0.5"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
