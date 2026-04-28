import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: {
    direction: 'up' | 'down' | 'flat';
    value: string;
  };
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Stat card. Values are rendered in Geist Mono (highly readable for numbers,
 * NOT italic). Only page H1 titles use Fraunces italic. Labels use mono uppercase.
 */
export function Stat({
  label,
  value,
  hint,
  trend,
  size = 'md',
  className,
}: StatProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-glass-border bg-glass-base backdrop-blur-2xl backdrop-saturate-180 p-5 shadow-glass-sm',
        className
      )}
    >
      <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-2">
        {label}
      </div>

      <div
        className={cn(
          'font-mono text-ink tabular-nums tracking-tight',
          size === 'sm' && 'text-2xl',
          size === 'md' && 'text-3xl',
          size === 'lg' && 'text-4xl'
        )}
      >
        {value}
      </div>

      {(hint || trend) && (
        <div className="mt-2 flex items-center gap-2">
          {trend && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-[11px] font-mono',
                trend.direction === 'up' && 'text-success',
                trend.direction === 'down' && 'text-danger',
                trend.direction === 'flat' && 'text-ink-faint'
              )}
            >
              {trend.direction === 'up' && '▲'}
              {trend.direction === 'down' && '▼'}
              {trend.direction === 'flat' && '━'}
              {trend.value}
            </span>
          )}
          {hint && (
            <span className="text-[11px] font-sans text-ink-faint">{hint}</span>
          )}
        </div>
      )}
    </div>
  );
}
