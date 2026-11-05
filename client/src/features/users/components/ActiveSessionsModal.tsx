import React, { useEffect, useState } from 'react';
import { Laptop, Smartphone, Globe, ShieldAlert, Trash2, RefreshCw, X } from 'lucide-react';
import { fetchSessions, revokeSession } from '@/features/auth/api';
import type { UserSession } from '@/features/auth/types';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';

interface ActiveSessionsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ActiveSessionsModal({ open, onClose }: ActiveSessionsModalProps) {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await fetchSessions();
      setSessions(data);
    } catch (err: any) {
      toast.error(err.message || 'Gagal memuat sesi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadSessions();
  }, [open]);

  if (!open) return null;

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await revokeSession(id);
      toast.success('Sesi berhasil dicabut');
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      toast.error(err.message || 'Gagal mencabut sesi');
    } finally {
      setRevokingId(null);
    }
  };

  const getDeviceIcon = (ua: string) => {
    const l = ua.toLowerCase();
    if (l.includes('mobile') || l.includes('android') || l.includes('iphone')) {
      return <Smartphone className="w-4 h-4 text-emerald-500" />;
    }
    return <Laptop className="w-4 h-4 text-blue-500" />;
  };

  const parseUserAgent = (ua: string) => {
    if (!ua || ua === 'unknown') return 'Unknown Browser';
    let browser = 'Web Browser';
    let os = 'Unknown OS';

    if (ua.includes('Chrome/')) browser = 'Google Chrome';
    else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Apple Safari';
    else if (ua.includes('Edge/')) browser = 'Microsoft Edge';

    if (ua.includes('Macintosh')) os = 'macOS';
    else if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('iPhone')) os = 'iOS';
    else if (ua.includes('Android')) os = 'Android';

    return `${browser} on ${os}`;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Sesi Aktif</h2>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Daftar perangkat yang saat ini memiliki token login aktif
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={loadSessions} disabled={loading} title="Segarkan">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} title="Tutup">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {loading && sessions.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--muted-foreground)]">
              Memuat daftar sesi...
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--muted-foreground)]">
              Tidak ada sesi aktif lain.
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`p-3.5 rounded-lg border flex items-center justify-between gap-4 transition ${
                  s.isCurrent
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-[var(--border)] bg-[var(--background)]/50 hover:bg-[var(--background)]'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 p-2 rounded-md bg-[var(--muted)]">
                    {getDeviceIcon(s.userAgent)}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--foreground)] truncate">
                        {parseUserAgent(s.userAgent)}
                      </span>
                      {s.isCurrent && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                          Sesi Ini
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[var(--muted-foreground)]">
                      <span className="flex items-center gap-1 font-mono">
                        <Globe className="w-3 h-3" /> {s.ip}
                      </span>
                      <span>•</span>
                      <span>Terakhir aktif: {formatDate(s.lastUsedAt)}</span>
                    </div>
                  </div>
                </div>

                {!s.isCurrent && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={revokingId === s.id}
                    onClick={() => handleRevoke(s.id)}
                    className="text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20 shrink-0 gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Cabut Sesi</span>
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--muted)]/20 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>Total {sessions.length} sesi terdaftar</span>
          <Button variant="default" size="sm" onClick={onClose}>
            Selesai
          </Button>
        </div>
      </div>
    </div>
  );
}

