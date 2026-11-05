import * as React from 'react';
import { cn } from '@/shared/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer';

    const variants = {
      default: 'btn-silver bg-[var(--primary)] text-[var(--primary-foreground)] active:scale-[0.98]',
      destructive: 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 active:scale-[0.98]',
      outline: 'metal border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:brightness-110 active:scale-[0.98]',
      secondary: 'bg-[var(--muted)] text-[var(--foreground)] hover:opacity-80 active:scale-[0.98]',
      ghost: 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
      link: 'text-[var(--foreground)] underline-offset-4 hover:underline'
    };

    const sizes = {
      default: 'h-8 px-3 py-1.5',
      sm: 'h-7 px-2.5 text-[11px]',
      lg: 'h-9 px-4 text-sm',
      icon: 'h-8 w-8'
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
