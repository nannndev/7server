import * as React from 'react';
import { cn } from '@/shared/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const base = 'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-none';

  const variants = {
    default: 'bg-[var(--primary)] text-[var(--primary-foreground)]',
    secondary: 'border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]',
    destructive: 'border border-red-500/20 bg-red-500/10 text-red-500',
    outline: 'border border-[var(--border)] text-[var(--foreground)] font-mono',
    success: 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
    warning: 'border border-amber-500/20 bg-amber-500/10 text-amber-500'
  };

  return <div className={cn(base, variants[variant], className)} {...props} />;
}
