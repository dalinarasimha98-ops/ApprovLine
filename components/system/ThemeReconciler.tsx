'use client';

import { useEffect, useRef } from 'react';
import { isThemePreference, type ThemePreference } from '@/lib/theme';
import { useTheme } from '@/components/system/ThemeProvider';

/**
 * Renders nothing - it exists purely to close one gap in an otherwise
 * cookie-only, zero-flash theme system: a user who chose a theme on one
 * browser/device has no cookie yet on a second one, so the very first
 * request there falls back to the safe 'dark' default (see
 * lib/theme.ts's readThemeCookie()) rather than their real preference.
 * Once the authenticated shell loads (DashboardShell, which already fetches
 * the user's row for the page it's on) and finds the real DB value differs
 * from what the cookie-derived render used, this applies it immediately
 * client-side and writes the cookie so every later request on THIS browser
 * is correct from the very first byte - a one-time, bounded correction on
 * a new device only, never a flash on ordinary navigation or refresh.
 */
export function ThemeReconciler({
  dbTheme,
  syncCookieAction,
}: {
  dbTheme: string | null;
  syncCookieAction: (theme: ThemePreference) => Promise<void>;
}) {
  const { theme, applyTheme } = useTheme();
  const reconciledRef = useRef(false);

  useEffect(() => {
    if (reconciledRef.current) return;
    reconciledRef.current = true;
    if (!isThemePreference(dbTheme)) return;
    if (dbTheme === theme) return;
    applyTheme(dbTheme);
    void syncCookieAction(dbTheme);
  }, [dbTheme, theme, applyTheme, syncCookieAction]);

  return null;
}
