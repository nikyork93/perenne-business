'use client';

import { useTheme } from './ThemeProvider';

interface Props {
  className?: string;
}

/**
 * Compact dark/light toggle pill.
 * Designed for sidebar bottom near "Sign out".
 */
export function ThemeToggle({ className = '' }: Props) {
  const { theme, toggleTheme, isReady } = useTheme();

  // Avoid hydration mismatch — render placeholder until mounted
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
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`group flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-glass-border bg-surface-faint hover:bg-surface-hover hover:border-glass-hairline transition text-[11px] font-mono text-ink-dim hover:text-ink ${className}`}
    >
      <span className="flex-1 text-left tracking-wider uppercase">
        {theme === 'dark' ? 'Dark' : 'Light'}
      </span>

      {/* Pill switcher */}
      <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-glass-border transition group-hover:bg-glass-hairline">
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-accent shadow-sm transition ${
            theme === 'light' ? 'translate-x-4' : 'translate-x-0.5'
          }`}
          aria-hidden="true"
        />
      </span>

      {/* Icon */}
      <span aria-hidden="true" className="text-[13px] leading-none">
        {theme === 'dark' ? '◐' : '◑'}
      </span>
    </button>
  );
}
