import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  RotateCw,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Globe,
  FileText,
  Calendar,
  X,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { Modal } from '@/shared/ui/modal';
import { toast } from '@/shared/ui/toast';
import { useServerPage } from './context';
import {
  fetchCertificates,
  renewCertificates,
  issueCertificate,
  type CertificateItem,
  type CertRenewalResult
} from '@/features/servers/api';
import { swr } from '@/shared/lib/cache';
import { useT } from '@/shared/i18n';

export default function SslTab() {
  const t = useT();
  const { server } = useServerPage();

  const [certs, setCerts] = useState<CertificateItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Issue Modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueDomain, setIssueDomain] = useState('');
  const [issueEmail, setIssueEmail] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issueResult, setIssueResult] = useState<string | null>(null);

  // Renew State
  const [renewing, setRenewing] = useState(false);
  const [renewResult, setRenewResult] = useState<CertRenewalResult | null>(null);

  const loadCerts = async (force = false) => {
    setError(null);
    try {
      await swr(`certs:${server.id}`, () => fetchCertificates(server.id), setCerts, setLoading, force);
    } catch (err: any) {
      setError(err.message || 'Failed to load certificates');
    }
  };

  useEffect(() => {
    loadCerts();
  }, [server.id]);

  const handleRenewAll = async (dryRun = false) => {
    setRenewing(true);
    try {
      const res = await renewCertificates(server.id, dryRun);
      setRenewResult(res);
      if (!dryRun) {
        toast.success(t('ssl.renewSuccess'));
        loadCerts(true);
      } else {
        toast.info(t('ssl.dryRunSuccess'));
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to renew certificates');
    } finally {
      setRenewing(false);
    }
  };

  const handleIssueCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueDomain.trim()) return;

    setIssuing(true);
    setIssueResult(null);
    try {
      const res = await issueCertificate(server.id, {
        domain: issueDomain.trim(),
        email: issueEmail.trim()
      });
      setIssueResult(res.stdout);
      if (res.success) {
        setIssueDomain('');
        setIssueEmail('');
        loadCerts(true);
      }
    } catch (err: any) {
      setIssueResult(err.message || 'Failed to issue certificate');
    } finally {
      setIssuing(false);
    }
  };

  const validCount = certs?.filter((c) => c.isValid && !c.isExpiringSoon).length || 0;
  const expiringCount = certs?.filter((c) => c.isExpiringSoon).length || 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <Card className="p-6 bg-gradient-to-r from-[var(--card)] via-[var(--card)] to-[var(--primary)]/5 border-[var(--border)] relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
              </span>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('ssl.title')}</h2>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] max-w-2xl leading-relaxed">
              {t('ssl.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono mr-2">
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {validCount} {t('ssl.valid').toLowerCase()}
              </span>
              {expiringCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {expiringCount} {t('ssl.expiringSoon').toLowerCase()}
                </span>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRenewAll(false)}
              disabled={renewing}
              className="gap-1.5 h-8 text-xs font-medium"
              title={t('ssl.renewAll')}
            >
              {renewing ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>{renewing ? t('ssl.renewing') : t('ssl.renewAll')}</span>
            </Button>

            <Button
              size="sm"
              onClick={() => {
                setIssueResult(null);
                setShowIssueModal(true);
              }}
              className="gap-1.5 h-8 text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('ssl.issueNew')}</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => loadCerts(true)} className="h-6 text-[10px]">
            {t('common.retry')}
          </Button>
        </div>
      )}

      {/* Certificates Cards */}
      {!certs && !error ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : certs && certs.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <Lock className="w-8 h-8 text-[var(--muted-foreground)] mx-auto opacity-50" />
          <p className="text-xs text-[var(--muted-foreground)]">{t('ssl.empty')}</p>
          <Button
            size="sm"
            onClick={() => {
              setIssueResult(null);
              setShowIssueModal(true);
            }}
            className="text-xs gap-1.5 font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('ssl.issueNew')}</span>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {certs?.map((cert) => {
            const isDanger = !cert.isValid;
            const isWarning = cert.isExpiringSoon;

            return (
              <Card
                key={cert.name}
                className="p-5 flex flex-col justify-between space-y-4 bg-[var(--card)] border-[var(--border)] shadow-sm hover:border-[var(--muted-foreground)]/30 transition-all"
              >
                <div className="space-y-3">
                  {/* Top Row: Name and Status Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`p-2 rounded-xl border shrink-0 ${
                          isDanger
                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                            : isWarning
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        }`}
                      >
                        {isDanger ? (
                          <ShieldAlert className="w-5 h-5" />
                        ) : isWarning ? (
                          <AlertTriangle className="w-5 h-5" />
                        ) : (
                          <ShieldCheck className="w-5 h-5" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-[var(--foreground)] truncate sensitive">
                          {cert.name}
                        </h4>
                        <span className="text-[11px] font-mono text-[var(--muted-foreground)] flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {cert.expiryDate || 'Unknown expiry'}
                        </span>
                      </div>
                    </div>

                    <Badge
                      variant={isDanger ? 'destructive' : isWarning ? 'warning' : 'success'}
                      className="text-[10px] py-0.5 px-2 font-mono shrink-0"
                    >
                      {isDanger
                        ? t('ssl.expired')
                        : isWarning
                        ? t('ssl.expiringSoon')
                        : t('ssl.daysLeft', { days: cert.daysRemaining })}
                    </Badge>
                  </div>

                  {/* Domain pills */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {cert.domains.map((dom) => (
                      <span
                        key={dom}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] sensitive"
                      >
                        <Globe className="w-3 h-3 text-[var(--primary)]" />
                        <span className="sensitive">{dom}</span>
                      </span>
                    ))}
                  </div>

                  {/* Paths */}
                  <div className="space-y-1 text-[11px] font-mono text-[var(--muted-foreground)] bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
                    <div className="truncate sensitive" title={cert.certPath}>
                      <span className="text-zinc-500">cert:</span> {cert.certPath}
                    </div>
                    <div className="truncate sensitive" title={cert.keyPath}>
                      <span className="text-zinc-500">key:</span> {cert.keyPath}
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="pt-2 border-t border-[var(--border)]/70 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    Let’s Encrypt Auto-renew
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRenewAll(false)}
                    disabled={renewing}
                    className="h-7 text-xs gap-1.5 text-[var(--primary)]"
                  >
                    <RefreshCw className={`w-3 h-3 ${renewing ? 'animate-spin' : ''}`} />
                    <span>{t('ssl.renewAll')}</span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Issue New Certificate Modal */}
      {showIssueModal && (
        <Modal isOpen={showIssueModal} onClose={() => setShowIssueModal(false)} className="max-w-lg">
          <Card className="w-full p-5 space-y-4 bg-[var(--card)] border-[var(--border)] shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                <Lock className="w-4 h-4 text-[var(--primary)]" />
                {t('ssl.issueNew')}
              </h3>
              <button
                onClick={() => setShowIssueModal(false)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleIssueCertificate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--foreground)]">{t('ssl.domain')}</label>
                <Input
                  type="text"
                  value={issueDomain}
                  onChange={(e) => setIssueDomain(e.target.value)}
                  placeholder={t('ssl.domainPlaceholder')}
                  className="font-mono text-xs sensitive"
                  required
                />
                <span className="text-[10px] text-[var(--muted-foreground)] sensitive">
                  {t('ssl.domainHint', { host: server.host })}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--foreground)]">{t('ssl.email')}</label>
                <Input
                  type="email"
                  value={issueEmail}
                  onChange={(e) => setIssueEmail(e.target.value)}
                  placeholder={t('ssl.emailPlaceholder')}
                  className="text-xs"
                />
              </div>

              {issueResult && (
                <div className="p-3 rounded-lg bg-zinc-950 font-mono text-[11px] text-zinc-300 max-h-40 overflow-y-auto whitespace-pre border border-zinc-800">
                  {issueResult}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowIssueModal(false)}
                  className="text-xs"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={issuing}
                  className="text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)]"
                >
                  {issuing ? t('ssl.issuing') : t('ssl.issueBtn')}
                </Button>
              </div>
            </form>
          </Card>
        </Modal>
      )}

      {/* Renewal Output Drawer Modal */}
      {renewResult && (
        <Modal isOpen={!!renewResult} onClose={() => setRenewResult(null)} className="max-w-xl">
          <Card className="w-full p-5 space-y-3 bg-[var(--card)] border-[var(--border)] flex flex-col max-h-[80vh] shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('ssl.renewalResult')}</h3>
              </div>
              <button
                onClick={() => setRenewResult(null)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 rounded-xl bg-zinc-950 p-4 font-mono text-xs text-zinc-200 overflow-auto whitespace-pre leading-relaxed border border-zinc-800">
              {renewResult.stdout || t('ssl.noOutput')}
            </div>

            <div className="pt-2 flex justify-end">
              <Button size="sm" onClick={() => setRenewResult(null)} className="text-xs">
                {t('common.close')}
              </Button>
            </div>
          </Card>
        </Modal>
      )}
    </div>
  );
}

