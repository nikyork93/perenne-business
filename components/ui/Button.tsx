import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'upload';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Full width */
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'md',
      loading = false,
      block = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          // base
          'inline-flex items-center justify-center gap-2 rounded-[10px]',
          'font-medium transition-all duration-200',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0',

          // sizes
          size === 'sm' && 'text-[11px] px-3 py-1.5',
          size === 'md' && 'text-xs px-4 py-2.5',
          size === 'lg' && 'text-sm px-5 py-3',

          // variants
          variant === 'default' && [
            'border border-glass-border bg-white/[0.06] text-ink',
            'hover:bg-white/[0.11] hover:border-glass-hairline hover:-translate-y-px',
          ],
          variant === 'primary' && [
            'text-[#1a1309] font-semibold border border-accent/40',
            'bg-[linear-gradient(135deg,#d4a574_0%,#b8885c_100%)]',
            'hover:bg-[linear-gradient(135deg,#e0b284_0%,#c89563_100%)]',
            'hover:shadow-accent-glow hover:-translate-y-px',
          ],
          variant === 'danger' && [
            'bg-danger/10 border border-danger/30 text-[#ff9a9a]',
            'hover:bg-danger/[0.18] hover:border-danger/50',
          ],
          variant === 'ghost' && [
            'border border-transparent text-ink-dim',
            'hover:bg-white/[0.05] hover:text-ink',
          ],
          variant === 'upload' && [
            'w-full border border-dashed border-white/15 bg-white/[0.02] text-ink-dim',
            'hover:bg-white/[0.05] hover:border-glass-hairline hover:text-ink py-3.5',
          ],

          block && 'w-full',
          className
        )}
        {...props}
      >
        {loading ? <span className="animate-pulse">…</span> : children}
      </button>
    );
  }
);

Button.displayName = 'Button';
