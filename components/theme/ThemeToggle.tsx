'use client';

import { useTheme } from './ThemeProvider';

interface Props {
  className?: string;
}

/**
 * Compact dark/light toggle pill + auto-schedule toggle.
 * - Manual click toggles theme and disables auto.
 * - Bottom row toggles auto (08:00 light → 20:00 dark, local time).
 */
export function ThemeToggle({ className = '' }: Props) {
  const { theme, toggleTheme, isReady, autoEnabled, setAutoEnabled } = useTheme();

  if (!isReady) {
    return (
      <div
        className={`flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg border border-glass-border bg-surface-faint text-[11px] text-ink-faint font-mono opacity-50 ${className}`}
      >
        <span>·</span>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Theme manual toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="group flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-glass-border bg-surface-faint hover:bg-surface-hover hover:border-glass-hairline transition text-[11px] font-mono text-ink-dim hover:text-ink"
      >
        <span className="flex-1 text-left tracking-wider uppercase">
          {theme === 'dark' ? 'Dark' : 'Light'}
        </span>
        <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-glass-border transition group-hover:bg-glass-hairline">
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-accent shadow-sm transition ${
              theme === 'light' ? 'translate-x-4' : 'translate-x-0.5'
            }`}
            aria-hidden="true"
          />
        </span>
        <span aria-hidden="true" className="text-[13px] leading-none">
          {theme === 'dark' ? '◐' : '◑'}
        </span>
      </button>

      {/* Auto schedule toggle. Subtler styling because secondary. */}
      <button
        type="button"
        onClick={() => setAutoEnabled(!autoEnabled)}
        aria-label={autoEnabled ? 'Disable auto schedule' : 'Enable auto schedule (08:00 light, 20:00 dark)'}
        title="Light from 08:00, dark from 20:00 (browser time)"
        className={`group flex items-center gap-2 w-full px-3 py-1.5 rounded-lg border transition text-[10px] font-mono tracking-wider uppercase ${
          autoEnabled
            ? 'border-accent/30 bg-accent-soft text-accent'
            : 'border-glass-border bg-surface-faint hover:bg-surface-hover text-ink-faint hover:text-ink-dim'
        }`}
      >
        <span className="flex-1 text-left">Auto · 8 → 20</span>
        <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition ${autoEnabled ? 'bg-accent/40' : 'bg-glass-border'}`}>
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition ${
              autoEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
            }`}
            aria-hidden="true"
          />
        </span>
      </button>
    </div>
  );
}
