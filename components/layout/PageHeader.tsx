import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface PageHeaderProps {
  title: string;
  /** Optional italic subtitle above the title */
  eyebrow?: string;
  description?: string;
  /** Right-aligned action buttons */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, eyebrow, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex items-start justify-between gap-6 mb-8', className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="label mb-2">{eyebrow}</div>
        )}
        <h1 className="font-display italic text-[38px] leading-[1.05] tracking-tight text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-3 text-sm text-ink-dim max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
