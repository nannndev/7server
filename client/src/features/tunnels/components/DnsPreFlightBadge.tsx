import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Loader2, Copy, Check } from 'lucide-react';
import { checkDomainDns } from '../api';
import type { DnsCheckResult } from '../types';

interface DnsPreFlightBadgeProps {
  domain: string;
  serverIp?: string;
}

export default function DnsPreFlightBadge({ domain, serverIp }: DnsPreFlightBadgeProps) {
  const [result, setResult] = useState<DnsCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  useEffect(() => {
    if (!cleanDomain || !cleanDomain.includes('.') || cleanDomain.endsWith('.')) {
      setResult(null);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await checkDomainDns(cleanDomain, serverIp);
        setResult(res);
      } catch (e) {
        setResult(null);
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [cleanDomain, serverIp]);

  if (!cleanDomain || !cleanDomain.includes('.')) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)] pt-1">
        <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
        <span>Checking DNS resolution for <span className="sensitive">{cleanDomain}</span>...</span>
      </div>
    );
  }

  if (!result) return null;

  const targetSubdomain = cleanDomain.split('.')[0] || '@';

  const copyRecord = () => {
    const text = serverIp ? `Type: A | Host: ${targetSubdomain} | Points to: ${serverIp}` : cleanDomain;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (result.status === 'ok') {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 pt-1">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>DNS verified: points to <span className="sensitive">{result.serverIp || result.resolvedIps[0]}</span> (Let's Encrypt SSL ready)</span>
      </div>
    );
  }

  if (result.status === 'nxdomain') {
    return (
      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1.5 mt-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>DNS record not found (NXDOMAIN)</span>
          </div>
          {serverIp && (
            <button
              type="button"
              onClick={copyRecord}
              className="text-[10px] text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded flex items-center gap-1 border border-zinc-700"
            >
              {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
              {copied ? 'Copied' : 'Copy DNS Record'}
            </button>
          )}
        </div>
        <p className="text-[11px] text-amber-200/80 leading-relaxed">
          {serverIp ? (
            <>
              Before Let's Encrypt SSL can be issued, add an <strong>A-Record</strong> in Cloudflare/DNS provider:{' '}
              <code className="text-amber-100 bg-amber-950/60 px-1 py-0.5 rounded font-mono sensitive">
                {targetSubdomain} → {serverIp}
              </code>
            </>
          ) : (
            'Ensure this domain is pointed to your server IP in DNS before deploying.'
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-300 space-y-1 mt-1.5">
      <div className="flex items-center gap-1.5 font-medium">
        <AlertCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
        <span>DNS IP Mismatch</span>
      </div>
      <p className="text-[11px] text-yellow-200/80">
        Domain resolves to <code className="font-mono text-white sensitive">{result.resolvedIps.join(', ')}</code>, but server IP is{' '}
        <code className="font-mono text-white sensitive">{result.serverIp}</code>. SSL challenge may fail if DNS is pointed to another host.
      </p>
    </div>
  );
}

