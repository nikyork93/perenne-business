'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  isReady: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ProviderProps {
  initialTheme: Theme;
  /** When true, the user is signed in and we should persist changes to DB */
  authenticated?: boolean;
  children: ReactNode;
}

/**
 * ThemeProvider — manages dark/light theme.
 *
 * Hydration:
 * 1. Server renders with `data-theme` attribute set on <html> via cookie (see app/layout.tsx).
 * 2. Client mounts and reads same value from DB-loaded session. No flash.
 *
 * Persistence:
 * - Cookie `perenne_theme` (1 year) — read by middleware/layout for SSR.
 * - DB User.themePreference — synced via PATCH /api/user/me on change.
 */
export function ThemeProvider({ initialTheme, authenticated, children }: ProviderProps) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [isReady, setIsReady] = useState(false);

  // Apply theme to <html data-theme="..."> on mount and on change
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    setIsReady(true);
  }, [theme]);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      // Cookie for SSR consistency on next request
      document.cookie = `perenne_theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      // Persist to DB if authenticated
      if (authenticated) {
        fetch('/api/user/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ themePreference: next }),
        }).catch(() => {
          /* non-fatal — cookie is the source of truth client-side */
        });
      }
    },
    [authenticated]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isReady }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
