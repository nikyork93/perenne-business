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
 *
 * Status colours are driven by CSS vars defined in globals.css so
 * they shift between dark and light themes. Previously we used raw
 * Tailwind `text-emerald-200` which looked great on dark but became
 * unreadable on the light grey background.
 */
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  const baseStyle: React.CSSProperties | undefined =
    tone === 'success'
      ? {
          borderColor: 'var(--success-border)',
          background: 'var(--success-soft)',
          color: 'var(--success-text)',
        }
      : tone === 'warning'
      ? {
          borderColor: 'var(--warning-border)',
          background: 'var(--warning-soft)',
          color: 'var(--warning-text)',
        }
      : tone === 'danger'
      ? {
          borderColor: 'var(--danger-border)',
          background: 'var(--danger-soft)',
          color: 'var(--danger-text)',
        }
      : tone === 'info'
      ? {
          borderColor: 'var(--info-border)',
          background: 'var(--info-soft)',
          color: 'var(--info-text)',
        }
      : undefined;

  return (
    <span
      style={baseStyle}
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-widest border',
        tone === 'neutral' && 'border-glass-border bg-white/[0.04] text-ink-dim',
        tone === 'accent' && 'border-accent/30 bg-accent-soft text-accent-bright',
        className
      )}
    >
      {children}
    </span>
  );
}
