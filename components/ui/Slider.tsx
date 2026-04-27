'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  /** Formatted display value (e.g. "45%", "180°") */
  displayValue?: string;
}

/**
 * Styled range input. Pairs with a label + displayValue on the right.
 * For canvas editor controls (scale, rotation, opacity).
 */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ className, label, displayValue, ...props }, ref) => {
    return (
      <div className="w-full">
        {(label || displayValue) && (
          <div className="label mb-2 flex items-center justify-between">
            {label && <span>{label}</span>}
            {displayValue && (
              <span className="font-mono text-[10px] text-ink-dim normal-case tracking-normal">
                {displayValue}
              </span>
            )}
          </div>
        )}
        <input
          ref={ref}
          type="range"
          className={cn('perenne-slider', className)}
          {...props}
        />
        <style jsx>{`
          .perenne-slider {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 2px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            outline: none;
          }
          .perenne-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 14px;
            height: 14px;
            background: #d4a574;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 0 12px rgba(212, 165, 116, 0.35);
            transition: transform 0.15s;
          }
          .perenne-slider::-webkit-slider-thumb:hover {
            transform: scale(1.2);
          }
          .perenne-slider::-moz-range-thumb {
            width: 14px;
            height: 14px;
            background: #d4a574;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 0 12px rgba(212, 165, 116, 0.35);
          }
        `}</style>
      </div>
    );
  }
);
Slider.displayName = 'Slider';
