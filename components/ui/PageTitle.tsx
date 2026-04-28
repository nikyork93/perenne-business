import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface PageTitleProps {
  eyebrow?: string;
  children: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * Page header. The H1 is the ONLY element using Fraunces italic in the app —
 * this gives the brand a recognizable identity without making numbers/data
 * unreadable elsewhere. Eyebrow, description, and actions use sans/mono.
 */
export function PageTitle({
  eyebrow,
  children,
  description,
  actions,
  className,
}: PageTitleProps) {
  return (
    <div className={cn('mb-8', className)}>
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-2">
              {eyebrow}
            </div>
          )}
          <h1 className="font-display italic text-4xl md:text-5xl text-ink tracking-tight leading-tight">
            {children}
          </h1>
          {description && (
            <p className="mt-3 text-sm text-ink-dim leading-relaxed max-w-2xl">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
