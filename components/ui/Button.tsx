'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'default' | 'primary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', block = false, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        // base
        'inline-flex items-center justify-center font-medium tracking-wide rounded-2xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0',

        // sizes
        size === 'sm' && 'px-3 py-1.5 text-[11px]',
        size === 'md' && 'px-5 py-2.5 text-sm',
        size === 'lg' && 'px-7 py-3 text-sm',

        // variants
        variant === 'default' && [
          'border border-glass-border bg-white/[0.06] text-ink',
          'hover:bg-white/[0.11] hover:border-glass-hairline hover:-translate-y-px',
        ],
        variant === 'primary' && [
          'bg-accent text-white border border-accent-bright/30',
          'shadow-lg shadow-accent/20',
          'hover:bg-accent-bright hover:shadow-accent/30 hover:-translate-y-0.5',
        ],
        variant === 'ghost' && [
          'text-ink-dim hover:text-ink hover:bg-white/[0.04]',
        ],
        variant === 'danger' && [
          'border border-red-400/30 bg-red-400/10 text-red-200',
          'hover:bg-red-400/20 hover:border-red-400/50 hover:-translate-y-px',
        ],

        // block
        block && 'w-full',

        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
