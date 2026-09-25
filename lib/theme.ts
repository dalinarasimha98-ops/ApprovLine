/**
 * The application-wide appearance preference. 'system' means "follow the
 * viewer's OS/browser preference" - represented by omitting the data-theme
 * attribute entirely (see lib/theme-cookie.ts's readThemeCookie() and
 * app/layout.tsx) so the CSS media query in app/globals.css resolves it
 * with zero JavaScript.
 *
 * Deliberately free of any server-only import (next/headers etc.) - this
 * file is imported from both server code and Client Components (e.g.
 * components/system/ThemeReconciler.tsx), and a server-only import here
 * would break the client bundle even for consumers that only need the
 * type/helper below. The cookie read/write lives in lib/theme-cookie.ts.
 */
export type ThemePreference = 'dark' | 'light' | 'system';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}
