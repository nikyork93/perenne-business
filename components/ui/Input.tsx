import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Use monospace font (good for numeric/hex) */
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, mono = false, id, ...props }, ref) => {
    const inputId = id || (label ? `input-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="label mb-2 flex items-center justify-between"
          >
            <span>{label}</span>
            {hint && <span className="font-mono text-[10px] text-ink-dim normal-case tracking-normal">{hint}</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full bg-white/[0.04] border border-glass-border rounded-lg',
            'px-3 py-2 text-xs text-ink placeholder:text-ink-faint',
            'outline-none transition-colors',
            'focus:border-accent/50',
            mono && 'font-mono',
            error && 'border-danger/60 focus:border-danger',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-[11px] text-danger">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const textareaId = id || (label ? `ta-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="label mb-2 block">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full bg-white/[0.04] border border-glass-border rounded-lg',
            'px-3 py-2 text-xs text-ink placeholder:text-ink-faint',
            'outline-none transition-colors resize-y min-h-[80px]',
            'focus:border-accent/50',
            error && 'border-danger/60 focus:border-danger',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-[11px] text-danger">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
