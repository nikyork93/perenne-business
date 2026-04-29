'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
  children: ReactNode;
}

export function ThemeProvider({ initialTheme, children }: ProviderProps) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const dbSyncDone = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    setIsReady(true);
  }, [theme]);

  useEffect(() => {
    if (dbSyncDone.current) return;
    dbSyncDone.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/user/me', { method: 'GET' });
        if (cancelled) return;
        if (!res.ok) {
          setIsAuthenticated(false);
          return;
        }
        const data = await res.json();
        const dbTheme = data?.user?.themePreference as Theme | undefined;
        setIsAuthenticated(true);
        if ((dbTheme === 'dark' || dbTheme === 'light') && dbTheme !== theme) {
          setThemeState(dbTheme);
          document.cookie = `perenne_theme=${dbTheme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        }
      } catch {
        if (!cancelled) setIsAuthenticated(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      document.cookie = `perenne_theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      if (isAuthenticated) {
        fetch('/api/user/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ themePreference: next }),
        }).catch(() => {});
      }
    },
    [isAuthenticated]
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
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
