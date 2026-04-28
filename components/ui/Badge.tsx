import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

/**
 * Inline status badge. Uses Geist Sans, NOT italic.
 * Italic Fraunces is reserved for page H1 titles only.
 */
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-widest border',
        tone === 'neutral' && 'border-glass-border bg-white/[0.04] text-ink-dim',
        tone === 'accent' && 'border-accent/30 bg-accent-soft text-accent-bright',
        tone === 'success' && 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
        tone === 'warning' && 'border-amber-400/20 bg-amber-400/10 text-amber-200',
        tone === 'danger' && 'border-red-400/20 bg-red-400/10 text-red-200',
        tone === 'info' && 'border-sky-400/20 bg-sky-400/10 text-sky-200',
        className
      )}
    >
      {children}
    </span>
  );
}
