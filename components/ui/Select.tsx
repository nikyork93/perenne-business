import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, hint, error, children, id, ...props }, ref) => {
    const selectId = id || (label ? `sel-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="label mb-2 flex items-center justify-between">
            <span>{label}</span>
            {hint && (
              <span className="font-mono text-[10px] text-ink-dim normal-case tracking-normal">
                {hint}
              </span>
            )}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'w-full bg-white/[0.04] border border-glass-border rounded-lg',
            'px-3 py-2 text-xs text-ink appearance-none cursor-pointer',
            'outline-none transition-colors focus:border-accent/50',
            error && 'border-danger/60 focus:border-danger',
            className
          )}
          style={{
            backgroundImage:
              'url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23ffffff80\' stroke-width=\'2\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            paddingRight: '36px',
          }}
          {...props}
        >
          {children}
        </select>
        {error && <p className="mt-1.5 text-[11px] text-danger">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';
