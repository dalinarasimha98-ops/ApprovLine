'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';

type ThemeContextValue = {
  /** The viewer's stored preference - may be 'system'. */
  theme: ThemePreference;
  /** What is actually being rendered right now ('dark' or 'light'), with
   *  'system' already resolved against the OS preference - for any
   *  consumer (e.g. a chart) that needs a concrete mode rather than the
   *  raw preference. */
  resolvedTheme: 'dark' | 'light';
  /** Updates the DOM and local state immediately (the instant preview the
   *  spec requires) - this does NOT persist anything. Callers (the
   *  Preferences UI) separately call their own server action to persist,
   *  and only show a success state once that call actually succeeds -
   *  keeping the "never trust a client id, always persist through a real
   *  server-resolved mutation" rule intact while still giving instant
   *  visual feedback. */
  applyTheme: (theme: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Wraps the whole app (mounted once in the root layout, above both the
 * public marketing site and the authenticated dashboard) so any page can
 * read the current theme or switch it instantly. The server has already
 * stamped the correct data-theme attribute on <html> before this ever
 * mounts (see app/layout.tsx) - this provider's job is purely the
 * INSTANT client-side update on selection and exposing the resolved mode,
 * never the initial paint.
 */
export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme: ThemePreference;
}) {
  const [theme, setThemeState] = useState<ThemePreference>(initialTheme);
  const [systemIsDark, setSystemIsDark] = useState<boolean>(systemPrefersDark());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemIsDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const applyTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    if (typeof document === 'undefined') return;
    if (next === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', next);
    }
  }, []);

  const resolvedTheme: 'dark' | 'light' = theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;

  const value = useMemo(() => ({ theme, resolvedTheme, applyTheme }), [theme, resolvedTheme, applyTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme() must be used within a ThemeProvider.');
  return context;
}
