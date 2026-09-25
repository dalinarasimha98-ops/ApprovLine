import { cookies } from 'next/headers';
import { isThemePreference, type ThemePreference } from '@/lib/theme';

/**
 * Cookie name for the fast, per-browser theme cache used for zero-flash
 * SSR rendering. The durable, cross-device source of truth is User.theme
 * in the database (see services/userSettings.ts); this cookie is written
 * every time that DB value changes, and read here without ever touching
 * the database or Clerk - the root layout wraps public/marketing pages
 * too and must resolve instantly for every request.
 *
 * Server-only (imports next/headers) - never import this from a Client
 * Component. See lib/theme.ts for the client-safe type/helper.
 */
export const THEME_COOKIE_NAME = 'al-theme';
const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Reads the current browser's theme cookie for the root layout's SSR
 * render. Defaults to 'dark' (never 'system') when the cookie is absent -
 * ApprovLine was dark-only before this feature, so a first request with no
 * cookie yet (a new browser, or any request before a preference is ever
 * chosen) must keep today's look rather than silently switching an
 * existing user to their OS preference the moment this ships. 'system' is
 * strictly opt-in: it is only ever returned here once a viewer has
 * explicitly chosen it, which is what actually writes it into the cookie.
 */
export async function readThemeCookie(): Promise<ThemePreference> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE_NAME)?.value;
  return isThemePreference(value) ? value : 'dark';
}

/**
 * Persists the theme preference into the fast per-browser cookie. Only
 * callable from a Server Action or Route Handler - Next.js forbids
 * cookies().set() during a plain Server Component render - which matches
 * how this is actually invoked (services/userSettings.ts's
 * updateThemePreference, called from app/settings/profile/page.tsx's
 * server action).
 */
export async function writeThemeCookie(theme: ThemePreference): Promise<void> {
  const store = await cookies();
  store.set(THEME_COOKIE_NAME, theme, {
    maxAge: THEME_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
}
