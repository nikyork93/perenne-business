import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Small, wide-tracked, uppercase section label used in sidebars and panels.
 * Example: <SectionLabel>Cover Background</SectionLabel>
 */
export function SectionLabel({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('label mb-3', className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Subdued italic text, typically used for empty states and inline hints.
 */
export function Whisper({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('font-display italic text-xs text-ink-faint text-center leading-relaxed', className)}
      {...props}
    >
      {children}
    </p>
  );
}
