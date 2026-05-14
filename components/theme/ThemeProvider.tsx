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
  /** Whether the auto-schedule (08:00 → light, 20:00 → dark) is on. */
  autoEnabled: boolean;
  setAutoEnabled: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ProviderProps {
  initialTheme: Theme;
  children: ReactNode;
}

/** Light during the day, dark at night — returns what the auto
 * schedule would pick RIGHT NOW based on the local browser hour. */
function scheduledThemeNow(): Theme {
  const h = new Date().getHours();
  return h >= 20 || h < 8 ? 'dark' : 'light';
}

const AUTO_PREF_KEY = 'perenne_theme_auto';

export function ThemeProvider({ initialTheme, children }: ProviderProps) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  // Auto schedule preference. Default OFF — users opt in. Persisted
  // in localStorage; we don't sync to DB to keep this purely a
  // device-level preference (a phone might want auto, a desktop not).
  const [autoEnabled, setAutoEnabledState] = useState<boolean>(false);
  const dbSyncDone = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    setIsReady(true);
  }, [theme]);

  // Hydrate auto preference + apply scheduled theme on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTO_PREF_KEY);
      if (stored === '1') {
        setAutoEnabledState(true);
        const scheduled = scheduledThemeNow();
        if (scheduled !== theme) {
          setThemeState(scheduled);
          document.cookie = `perenne_theme=${scheduled}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        }
      }
    } catch {
      // no-op: localStorage may be unavailable
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While auto is ON, run a check every minute and at the next 08:00
  // or 20:00 boundary. A minute interval is more than fast enough and
  // avoids the off-by-one issues of an exact timeout that drifts.
  useEffect(() => {
    if (!autoEnabled) return;
    const tick = () => {
      const next = scheduledThemeNow();
      setThemeState((current) => {
        if (current === next) return current;
        document.cookie = `perenne_theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        return next;
      });
    };
    tick(); // immediate check
    const interval = window.setInterval(tick, 60_000);
    return () => window.clearInterval(interval);
  }, [autoEnabled]);

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
        // Only honour the DB-stored theme when auto is OFF. With auto
        // on, the schedule is the source of truth.
        if (!autoEnabled && (dbTheme === 'dark' || dbTheme === 'light') && dbTheme !== theme) {
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
      // Manual change disables auto: the user clearly wants this
      // theme right now, regardless of the hour.
      if (autoEnabled) {
        setAutoEnabledState(false);
        try { localStorage.setItem(AUTO_PREF_KEY, '0'); } catch {}
      }
      if (isAuthenticated) {
        fetch('/api/user/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ themePreference: next }),
        }).catch(() => {});
      }
    },
    [isAuthenticated, autoEnabled]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const setAutoEnabled = useCallback((v: boolean) => {
    setAutoEnabledState(v);
    try { localStorage.setItem(AUTO_PREF_KEY, v ? '1' : '0'); } catch {}
    if (v) {
      // Snap to scheduled theme immediately on enable.
      const scheduled = scheduledThemeNow();
      if (scheduled !== theme) {
        setThemeState(scheduled);
        document.cookie = `perenne_theme=${scheduled}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isReady, autoEnabled, setAutoEnabled }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
