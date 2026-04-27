import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent' | 'info';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-white/[0.06] border-glass-border text-ink-dim',
  success: 'bg-emerald-400/10 border-emerald-400/30 text-emerald-300',
  warning: 'bg-amber-400/10 border-amber-400/30 text-amber-300',
  danger:  'bg-danger/10 border-danger/30 text-[#ff9a9a]',
  accent:  'bg-accent/10 border-accent/30 text-accent',
  info:    'bg-sky-400/10 border-sky-400/30 text-sky-300',
};

export function Badge({ className, tone = 'neutral', children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5',
        'text-[10px] font-medium tracking-[0.05em] uppercase',
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
