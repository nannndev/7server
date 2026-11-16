import { useEffect, useRef, useState } from 'react';
import { Activity, Play, RotateCcw, Sparkles, Square, Terminal } from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { ModelPicker } from '@/features/copilot/components/ModelPicker';
import { useI18n } from '@/shared/i18n';
import { fetchAccounts, fetchCombos, fetchGatewayConfig, runPlaygroundRequest } from './api';
import type { AiGatewayConfig } from './types';

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

export function Playground({ config }: { config: AiGatewayConfig | null }) {
  const { locale } = useI18n();
  const isId = locale === 'id';

  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState<string>('You are a helpful AI assistant running through 7Server AI Gateway.');
  const [prompt, setPrompt] = useState<string>('');
  const [temperature, setTemperature] = useState<number>(0.7);
  const [stream, setStream] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [output, setOutput] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<{
    status: number;
    durationMs: number;
    inTok: number;
    outTok: number;
    routedModel?: string;
  } | null>(null);

  const acRef = useRef<AbortController | null>(null);

  useEffect(() => {
    Promise.all([
      fetchAccounts().catch(() => ({ accounts: [], models: {}, aliases: {} })),
      fetchCombos().catch(() => ({})),
      config ? Promise.resolve(config) : fetchGatewayConfig().catch(() => null)
    ]).then(([{ accounts, models: acctModels, aliases }, combos, cfg]) => {
      const list: string[] = [];
      const seen = new Set<string>();
      const add = (id: string) => {
        if (!id || seen.has(id)) return;
        seen.add(id);
        list.push(id);
      };
      for (const name of Object.keys(combos)) add(`auto/${name}`);
      for (const a of accounts) {
        const prefix = (aliases as Record<string, string | undefined>)?.[a.provider] || ALIAS[a.provider];
        if (!prefix) continue;
        add(`${prefix}/auto`);
        for (const m of (acctModels as Record<string, string[]>)[a.provider] || []) add(`${prefix}/${m}`);
      }
      if (cfg?.providers) {
        for (const [provId, pCfg] of Object.entries(cfg.providers)) {
          if (!pCfg?.enabled || !pCfg?.connected) continue;
          add(`${provId}/auto`);
          if (pCfg.defaultModel) add(pCfg.defaultModel.includes('/') ? pCfg.defaultModel : `${provId}/${pCfg.defaultModel}`);
          for (const m of pCfg.models || []) add(m.includes('/') ? m : `${provId}/${m}`);
        }
      }
      setModels(list);
      if (!model && list.length > 0) setModel(list[0]!);
    });
  }, [config]);

  const stop = () => {
    acRef.current?.abort();
    acRef.current = null;
    setRunning(false);
  };

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!model.trim() || !prompt.trim() || running) return;

    const ac = new AbortController();
    acRef.current = ac;
    setRunning(true);
    setOutput('');
    setErrorMsg(null);
    setTelemetry(null);

    const t0 = performance.now();
    const messages = [
      ...(systemPrompt.trim() ? [{ role: 'system', content: systemPrompt.trim() }] : []),
      { role: 'user', content: prompt.trim() }
    ];

    try {
      const res = await runPlaygroundRequest(
        { model: model.trim(), messages, temperature, stream },
        ac.signal
      );

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const txt = await res.text();
        let msg = txt;
        try {
          const parsed = JSON.parse(txt);
          msg = parsed?.error?.message || parsed?.error || txt;
        } catch { /* raw text */ }
        setErrorMsg(`HTTP ${res.status}: ${msg}`);
        setTelemetry({ status: res.status, durationMs: Math.round(performance.now() - t0), inTok: 0, outTok: 0 });
        return;
      }

      if (!stream || !contentType.includes('text/event-stream') || !res.body) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
        setOutput(text);
        setTelemetry({
          status: res.status,
          durationMs: Math.round(performance.now() - t0),
          inTok: Number(data?.usage?.prompt_tokens) || 0,
          outTok: Number(data?.usage?.completion_tokens) || 0,
          routedModel: data?.model
        });
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let acc = '';
      let inTok = 0;
      let outTok = 0;
      let routedModel: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const ev = JSON.parse(payload);
            if (ev.model) routedModel = ev.model;
            const delta = ev.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) {
              acc += delta;
              setOutput(acc);
            }
            if (ev.usage) {
              inTok = Number(ev.usage.prompt_tokens) || inTok;
              outTok = Number(ev.usage.completion_tokens) || outTok;
            }
          } catch { /* ignore partial */ }
        }
      }

      setTelemetry({
        status: 200,
        durationMs: Math.round(performance.now() - t0),
        inTok,
        outTok,
        routedModel
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setErrorMsg(err?.message || 'Request failed');
      }
    } finally {
      acRef.current = null;
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-[var(--card)] border border-[var(--border)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[var(--foreground)]">
                {isId ? 'Playground Uji Coba Model' : 'AI Gateway Live Playground'}
              </h3>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {isId
                  ? 'Uji langsung model, combo (auto/<name>), atau per-provider auto (<alias>/auto) tanpa perlu paste key manual.'
                  : 'Test any connected model, combo (auto/<name>), or per-provider auto (<alias>/auto) through the live gateway.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--background)]">
              <input
                type="checkbox"
                checked={stream}
                onChange={(e) => setStream(e.target.checked)}
                className="rounded border-[var(--border)]"
              />
              <span>Stream (SSE)</span>
            </label>
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--background)]">
              <span className="text-[var(--muted-foreground)]">Temp</span>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Math.max(0, Math.min(2, Number(e.target.value) || 0)))}
                className="w-12 bg-transparent text-right font-mono focus:outline-none"
              />
            </label>
          </div>
        </div>

        <form onSubmit={run} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-[var(--muted-foreground)]">
                {isId ? 'Pilih Model / Combo / Auto' : 'Pick Model / Combo / Auto'}
              </label>
              <ModelPicker
                value={model}
                onChange={setModel}
                options={models}
                allowAuto={false}
                placement="bottom"
                variant="input"
                placeholder={models[0] || 'cc/claude-sonnet-4-6 or auto/...'}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-[var(--muted-foreground)]">
                {isId ? 'Atau ketik ID model manual' : 'Or type custom model ID'}
              </label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. openai/auto, auto/smart, cc/claude-sonnet-4-6"
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[var(--muted-foreground)]">
              System Prompt ({isId ? 'opsional' : 'optional'})
            </label>
            <Input
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[var(--muted-foreground)]">
              Prompt
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run();
              }}
              placeholder={isId ? 'Ketik pesan test... (Cmd/Ctrl+Enter untuk kirim)' : 'Type a test message... (Cmd/Ctrl+Enter to send)'}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {running ? (
                <Button type="button" onClick={stop} variant="outline" size="sm" className="text-rose-500 border-rose-500/40">
                  <Square className="w-3.5 h-3.5 mr-1.5" />
                  {isId ? 'Hentikan' : 'Stop'}
                </Button>
              ) : (
                <Button type="submit" disabled={!model.trim() || !prompt.trim()} size="sm" className="btn-metal">
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  {isId ? 'Kirim Request' : 'Run Request'}
                </Button>
              )}
              {(output || errorMsg) && !running && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOutput('');
                    setErrorMsg(null);
                    setTelemetry(null);
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            {telemetry && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                <span className={`px-2 py-0.5 rounded-full border ${
                  telemetry.status < 400
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-500'
                }`}>
                  HTTP {telemetry.status}
                </span>
                <span className="text-[var(--muted-foreground)]">{telemetry.durationMs} ms</span>
                {(telemetry.inTok > 0 || telemetry.outTok > 0) && (
                  <span className="text-[var(--foreground)]">
                    {telemetry.inTok} in / {telemetry.outTok} out tok
                  </span>
                )}
                {telemetry.routedModel && (
                  <span className="text-[var(--muted-foreground)]">{telemetry.routedModel}</span>
                )}
              </div>
            )}
          </div>
        </form>
      </Card>

      {(output || errorMsg || running) && (
        <Card className="p-4 bg-[var(--card)] border border-[var(--border)] space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
            {running ? <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" /> : <Terminal className="w-3.5 h-3.5 text-emerald-500" />}
            <span>{isId ? 'Respons Gateway' : 'Gateway Response'}</span>
          </div>
          {errorMsg ? (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-mono text-rose-400 whitespace-pre-wrap break-all">
              {errorMsg}
            </div>
          ) : (
            <pre className="p-3 rounded-lg bg-zinc-950/90 border border-[var(--border)] text-xs font-mono text-zinc-100 whitespace-pre-wrap break-words min-h-[80px] max-h-[420px] overflow-y-auto">
              {output || (running ? 'Streaming...' : '')}
            </pre>
          )}
        </Card>
      )}
    </div>
  );
}
