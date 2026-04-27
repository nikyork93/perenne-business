import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { GlassPanel } from '../ui/GlassPanel';

interface StatProps {
  /** Short label above the value */
  label: string;
  /** Main metric (number, currency, etc.) */
  value: ReactNode;
  /** Sub-text below the value (context, comparison) */
  hint?: ReactNode;
  /** Optional trend indicator: "+12%" green, "-3%" red */
  delta?: { value: string; positive?: boolean };
  className?: string;
}

export function Stat({ label, value, hint, delta, className }: StatProps) {
  return (
    <GlassPanel padding="md" className={cn('min-w-0', className)}>
      <div className="label mb-2">{label}</div>
      <div className="font-display italic text-[38px] leading-none text-ink tracking-tight">
        {value}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px]">
        {delta && (
          <span
            className={cn(
              'font-mono',
              delta.positive ? 'text-emerald-300' : 'text-[#ff9a9a]'
            )}
          >
            {delta.positive ? '▲' : '▼'} {delta.value}
          </span>
        )}
        {hint && <span className="text-ink-faint">{hint}</span>}
      </div>
    </GlassPanel>
  );
}
