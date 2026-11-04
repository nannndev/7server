import * as React from 'react';
import { cn } from '@/shared/lib/utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  indicatorClassName?: string;
}

export function Progress({ className, value = 0, indicatorClassName, ...props }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80', className)}
      {...props}
    >
      <div
        className={cn('h-full w-full flex-1 bg-zinc-200 transition-all duration-300', indicatorClassName)}
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </div>
  );
}

