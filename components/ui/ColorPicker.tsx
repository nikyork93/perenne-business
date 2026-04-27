'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/cn';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  /** Preset color swatches shown above the custom picker */
  presets?: string[];
  label?: string;
  className?: string;
}

const DEFAULT_PRESETS = [
  '#1a1a1a', '#2c2c2e', '#f5f5f0', '#e8dcc4',
  '#8b1a1a', '#1a4d3a', '#1e3a5f', '#4a2d5f',
  '#d4a574', '#2d4a1a', '#5f2d2d', '#f5c4a8',
];

export function ColorPicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  label = 'Color',
  className,
}: ColorPickerProps) {
  const [hexInput, setHexInput] = useState(value);

  useEffect(() => {
    setHexInput(value);
  }, [value]);

  function handleHexChange(v: string) {
    let hex = v.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    setHexInput(hex);
    if (/^#[0-9a-f]{6}$/i.test(hex)) onChange(hex);
  }

  return (
    <div className={cn('w-full', className)}>
      {label && <div className="label mb-2">{label}</div>}

      <div className="grid grid-cols-6 gap-1.5 mb-2.5">
        {presets.map((color) => {
          const active = color.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              aria-label={color}
              onClick={() => onChange(color)}
              className={cn(
                'aspect-square rounded-lg border border-glass-border cursor-pointer',
                'transition-transform hover:scale-110 relative'
              )}
              style={{ background: color }}
            >
              {active && (
                <span
                  className="absolute inset-[-3px] rounded-[10px] pointer-events-none border-[1.5px] border-accent"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-8 border border-glass-border rounded-lg cursor-pointer bg-transparent p-0"
          aria-label="Custom color"
        />
        <input
          type="text"
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          maxLength={7}
          className={cn(
            'flex-1 bg-white/[0.04] border border-glass-border rounded-lg',
            'px-3 py-2 text-xs font-mono text-ink',
            'outline-none transition-colors focus:border-accent/50'
          )}
        />
      </div>
    </div>
  );
}
