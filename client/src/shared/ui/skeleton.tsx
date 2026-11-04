import * as React from 'react';
import { cn } from '@/shared/lib/utils';

export function Skeleton({
  className,
  shimmer = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { shimmer?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'rounded-md bg-[var(--muted)]',
        shimmer ? 'shimmer-effect' : 'motion-safe:animate-pulse',
        className
      )}
      {...props}
    />
  );
}

// Placeholder shaped like a ServerCard so the grid doesn't jump when data lands.
export function ServerCardSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="w-9 h-9 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-1/4" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 flex-1" />
      </div>
    </div>
  );
}

export function RowsSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Memuat…" className={cn('space-y-2 p-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-7 w-full" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

// Reusable table skeleton with shimmer effect for data tables (PM2, WebApps, Services, Ports, Nginx, Audit)
export function TableSkeleton({
  rows = 5,
  cols = 5,
  colWidths
}: {
  rows?: number;
  cols?: number;
  colWidths?: string[];
}) {
  const widths = colWidths || ['w-1/4', 'w-1/6', 'w-1/4', 'w-1/6', 'w-1/12'];
  return (
    <div className="divide-y divide-[var(--border)] bg-[var(--card)]">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center px-3 py-3 gap-3">
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className={widths[c % widths.length] || 'flex-1'}>
              <Skeleton className="h-4 w-full" style={{ opacity: 1 - r * 0.08 }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Shimmer skeleton for file manager directory browsing
export function FileTableSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="divide-y divide-[var(--border)] bg-[var(--card)]">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center px-4 py-2.5 gap-4">
          <Skeleton className="w-4 h-4 rounded shrink-0" />
          <div className="flex-1">
            <Skeleton
              className="h-3.5"
              style={{ width: `${Math.max(30, (r * 23 + 45) % 80)}%` }}
            />
          </div>
          <Skeleton className="w-16 h-3 hidden sm:block shrink-0" />
          <Skeleton className="w-14 h-3 shrink-0" />
          <Skeleton className="w-24 h-3 hidden sm:block shrink-0" />
          <Skeleton className="w-12 h-6 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
}

// Shimmer skeleton for code editor / file viewer
export function CodeEditorSkeleton({ lines = 16 }: { lines?: number }) {
  // Pre-determined realistic code indentations and lengths
  const patterns = [
    { indent: 'w-48', pl: 'pl-0' },
    { indent: 'w-64', pl: 'pl-4' },
    { indent: 'w-80', pl: 'pl-8' },
    { indent: 'w-40', pl: 'pl-12' },
    { indent: 'w-72', pl: 'pl-12' },
    { indent: 'w-32', pl: 'pl-8' },
    { indent: 'w-56', pl: 'pl-4' },
    { indent: 'w-20', pl: 'pl-0' },
    { indent: 'w-60', pl: 'pl-0' },
    { indent: 'w-96', pl: 'pl-4' },
    { indent: 'w-44', pl: 'pl-8' },
    { indent: 'w-28', pl: 'pl-4' },
    { indent: 'w-72', pl: 'pl-0' }
  ];

  return (
    <div className="flex h-80 bg-zinc-950/70 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Line Numbers Gutter */}
      <div className="w-12 py-3 pr-2 text-right select-none font-mono text-[11px] text-zinc-600 border-r border-zinc-800/80 bg-zinc-950/80 space-y-2">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      {/* Code Lines Shimmer */}
      <div className="flex-1 p-3 space-y-2.5 overflow-hidden">
        {Array.from({ length: lines }, (_, i) => {
          const pat = patterns[i % patterns.length];
          return (
            <div key={i} className={cn('flex items-center', pat.pl)}>
              <Skeleton className={cn('h-3.5', pat.indent)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Shimmer skeleton for OverviewTab live metrics gauges
export function OverviewGaugesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="flex justify-between pt-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-3">
          <Skeleton className="h-4 w-36" />
          <div className="divide-y divide-[var(--border)] pt-2 space-y-3">
            {[0, 1, 2, 3, 4].map((j) => (
              <div key={j} className="pt-2 flex justify-between">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-32" />
              </div>
            ))}
          </div>
        </div>
        <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-3">
          <Skeleton className="h-4 w-44" />
          <div className="grid grid-cols-2 gap-2 pt-2">
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <Skeleton key={k} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
