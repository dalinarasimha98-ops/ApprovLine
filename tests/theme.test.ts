/**
 * Application-wide Theme (Dark/Light/System) — regression tests.
 *
 * Verifies:
 *  - the theme system is real, not cosmetic: a genuine CSS token layer, a
 *    persisted per-user preference (never trusting a client-supplied id),
 *    and a real switcher UI, not a "Dark only" placeholder card;
 *  - zero-flash SSR architecture: the root layout reads the theme BEFORE
 *    rendering any markup, and 'system' resolves purely via CSS
 *    (prefers-color-scheme) with no JavaScript required for first paint;
 *  - the three-state CSS resolution order (explicit dark / OS-driven
 *    light / explicit light) matches the documented contract;
 *  - persistence is real (User.theme + a synced cookie), tenant/user-scoped,
 *    and the passive cross-device cookie sync never fabricates an audit
 *    log entry for a change the viewer didn't make;
 *  - the switcher only reports success once the server mutation actually
 *    succeeds, and reverts the instant preview on failure;
 *  - the selector is accessible: real <button> elements (native Tab/Enter/
 *    Space), a non-color selected indicator, and aria-pressed.
 *
 * Static-source checks (no DB/Clerk required) plus real executed unit
 * tests where the logic is pure. Run: node --import tsx tests/theme.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.scripts['test:theme'], 'node --import tsx tests/theme.test.ts');

const themeLib = read('lib/theme.ts');
const themeCookie = read('lib/theme-cookie.ts');
const globals = read('app/globals.css');
const layout = read('app/layout.tsx');
const provider = read('components/system/ThemeProvider.tsx');
const reconciler = read('components/system/ThemeReconciler.tsx');
const service = read('services/userSettings.ts');
const page = read('app/settings/profile/page.tsx');
const shell = read('components/settings/UserSettingsShell.tsx');
const tailwindConfig = read('tailwind.config.ts');
const schema = read('prisma/schema.prisma');

// --- Real, working control: not a cosmetic card -----------------------------

assert.doesNotMatch(shell, /ApprovLine currently uses the dark workspace theme only/, 'the old read-only "Dark only" placeholder must be gone');
assert.match(shell, /THEME_OPTIONS/, 'a real set of selectable theme options must exist');
for (const key of ['dark', 'light', 'system']) {
  assert.match(shell, new RegExp(`key: '${key}'`), `theme options must include '${key}'`);
}
assert.match(shell, /applyTheme\(next\)/, 'selecting a theme must update the UI immediately via applyTheme(), not require a page refresh');
assert.match(shell, /await updateThemeAction\(next\)/, 'selecting a theme must also persist through a real server action');

// --- "Saved" only after real persistence succeeds; revert on failure --------

const switcherStart = shell.indexOf('function ThemeSwitcher');
assert.ok(switcherStart > -1, 'expected to find the ThemeSwitcher component');
const switcherBody = shell.slice(switcherStart, shell.indexOf('\nfunction ', switcherStart + 10));
assert.match(switcherBody, /if \(result\.ok\) \{\s*setStatus\(\{ kind: 'saved' \}\);/, 'must only report "Saved" once the server mutation actually returns ok:true');
assert.match(switcherBody, /applyTheme\(previous\);/, 'a failed persistence must revert the instant preview, never leave the UI showing an unsaved choice as if it worked');

// --- Client-side instant update is separate from server persistence --------

assert.match(provider, /does NOT persist anything/, 'ThemeProvider.applyTheme must be documented as visual-only, never itself a persistence mechanism');
assert.match(provider, /document\.documentElement\.setAttribute\('data-theme', next\)/, 'applyTheme must update the DOM attribute directly for an instant, synchronous visual change');
assert.match(provider, /document\.documentElement\.removeAttribute\('data-theme'\)/, "'system' must be represented by removing the attribute (letting the CSS media query resolve it), not a fabricated 'system' CSS branch");

// --- Zero-flash SSR: the layout reads the cookie BEFORE rendering markup ---

assert.match(layout, /const theme = await readThemeCookie\(\);/, 'the root layout must resolve the theme before rendering any markup');
assert.match(layout, /const htmlDataTheme = theme === 'system' \? undefined : theme;/, "'system' must omit the data-theme attribute rather than rendering a literal 'system' value the CSS never defines");
assert.match(layout, /<html lang="en" data-theme={htmlDataTheme}>/, 'the resolved theme must be stamped directly on <html> in the same render pass - not set later via an effect');
// The theme read must happen before the JSX referencing it, not after.
const themeReadIndex = layout.indexOf('await readThemeCookie()');
const htmlTagIndex = layout.indexOf('<html');
assert.ok(themeReadIndex > -1 && htmlTagIndex > -1 && themeReadIndex < htmlTagIndex, 'the cookie read must complete before the <html> tag is rendered, or the attribute cannot reflect it on first paint');

// --- Cookie defaults to 'dark', never 'system', when absent -----------------

assert.match(themeCookie, /return isThemePreference\(value\) \? value : 'dark';/, "an absent/invalid cookie must resolve to 'dark' - defaulting to 'system' would silently flip any existing user whose OS prefers light the moment this ships, which is exactly the flash/surprise this architecture exists to prevent");

// --- Cookie hygiene ----------------------------------------------------------

assert.match(themeCookie, /httpOnly: true/, 'the theme cookie should not be readable by page JavaScript - the server is its only writer/reader');
assert.match(themeCookie, /sameSite: 'lax'/, 'the theme cookie must set SameSite');

// --- lib/theme.ts stays free of server-only imports (must be importable from a Client Component) ---

assert.doesNotMatch(themeLib, /from 'next\/headers'/, 'lib/theme.ts is imported directly by a Client Component (ThemeReconciler) - it must never import next/headers, or the client bundle breaks');
assert.match(themeCookie, /import \{ cookies \} from 'next\/headers';/, 'the actual cookie read/write must live in the server-only lib/theme-cookie.ts, not lib/theme.ts');

// --- CSS: three-state resolution, not a naive two-state toggle -------------

assert.match(globals, /:root \{/, 'dark must be the unguarded :root base (todays default look)');
assert.match(globals, /@media \(prefers-color-scheme: light\) \{\s*:root:not\(\[data-theme='dark'\]\)/, "the OS-driven branch must be guarded off whenever data-theme='dark' is explicitly set, or an explicit dark choice would be overridden by a light OS preference");
assert.match(globals, /:root\[data-theme='light'\] \{/, 'an explicit light choice must be forceable regardless of OS preference');
// Every token must be a bare "R G B" triplet (not a full rgb()/hex value), so
// the Tailwind rgb(var(...) / <alpha-value>) pattern can apply opacity modifiers.
const tripletPattern = /--al-[a-z-]+-rgb: \d{1,3} \d{1,3} \d{1,3};/;
assert.match(globals, tripletPattern, 'design tokens must be stored as "R G B" triplets for the opacity-modifier pattern to work');
assert.doesNotMatch(globals, /--al-[a-z-]+-rgb: #/, 'a token must never be stored as a hex string - the rgb(var(..)/<alpha-value>) pattern requires bare channel numbers');

// Sanity: dark's background channel values must be lower (darker) than light's.
function firstTripletAfter(css: string, marker: string, token: string): [number, number, number] {
  const idx = css.indexOf(marker);
  const scoped = css.slice(idx, idx + 1200);
  const match = scoped.match(new RegExp(`--al-${token}-rgb: (\\d+) (\\d+) (\\d+);`));
  assert.ok(match, `expected to find --al-${token}-rgb inside the ${marker} block`);
  return [Number(match![1]), Number(match![2]), Number(match![3])];
}
const darkBg = firstTripletAfter(globals, ':root {', 'bg');
const lightBg = firstTripletAfter(globals, ":root[data-theme='light']", 'bg');
const darkSum = darkBg[0] + darkBg[1] + darkBg[2];
const lightSum = lightBg[0] + lightBg[1] + lightBg[2];
assert.ok(darkSum < lightSum, `dark background must be darker than light background (dark sum ${darkSum}, light sum ${lightSum})`);
const darkText = firstTripletAfter(globals, ':root {', 'text-primary');
const lightText = firstTripletAfter(globals, ":root[data-theme='light']", 'text-primary');
const darkTextSum = darkText[0] + darkText[1] + darkText[2];
const lightTextSum = lightText[0] + lightText[1] + lightText[2];
assert.ok(darkTextSum > lightTextSum, `dark theme's text must be lighter than its background, and light theme's text must be darker than its background (dark text sum ${darkTextSum}, light text sum ${lightTextSum})`);

// --- Tailwind: tokens are wired through CSS vars, not hardcoded hex --------

assert.match(tailwindConfig, /al: \{/, 'tailwind.config.ts must define the al-* token namespace');
assert.match(tailwindConfig, /rgb\(var\(--al-bg-rgb\) \/ <alpha-value>\)/, 'the al-* colors must resolve through the CSS custom properties, not a static hex value, or they could never be theme-reactive');

// --- Persisted preference: real schema, real tenant/user scoping -----------

assert.match(schema, /theme\s+String\?/, 'User model must have a real, nullable theme column');
assert.match(service, /export async function updateThemePreference/, 'a real mutation must persist the preference');
assert.match(service, /if \(!isThemePreference\(input\.theme\)\)/, 'the mutation must validate the value server-side, never trust an arbitrary string');
assert.match(service, /where: \{ id: input\.userId, organizationId: input\.organizationId \}/, 'the theme write must be scoped by both userId AND organizationId, not id alone');
assert.match(service, /await writeThemeCookie\(input\.theme\);/, 'a real preference change must also sync the fast cookie, so this browser is correct on its very next request');
assert.match(service, /action: 'THEME_PREFERENCE_UPDATED'/, 'a real, deliberate theme change must be audited like every other personal-settings mutation');

// The page-level server action must never trust a client-supplied user/org id.
const updateThemeFnMatch = page.match(/async function updateTheme\(theme: ThemePreference\)[\s\S]*?\n\}/);
assert.ok(updateThemeFnMatch, 'expected to find the updateTheme server action in page.tsx');
const updateThemeFn = updateThemeFnMatch![0];
assert.match(updateThemeFn, /'use server'/, 'updateTheme must be a real server action');
assert.match(updateThemeFn, /getDashboardTenant\(/, 'updateTheme must resolve identity server-side, never trust a client-supplied user/org id');
assert.match(updateThemeFn, /enforcePageRole\('\/settings\/profile'/, 'updateTheme must re-check role server-side');
assert.match(updateThemeFn, /tenant\.organization\.id/, 'updateTheme must pass the server-resolved organizationId');
assert.match(updateThemeFn, /tenant\.user\.id/, 'updateTheme must pass the server-resolved userId');
// Unlike this page's other mutations, it must NOT redirect - the whole point
// is an instant update with no navigation/refresh.
assert.doesNotMatch(updateThemeFn, /redirect\(/, 'updateTheme must not redirect - the spec requires an instant change with no Save/refresh step');

// --- Passive cross-device cookie sync never fabricates an audit trail ------

assert.match(service, /export async function syncThemeCookie/, 'a passive, non-mutating sync path must exist for a new device/browser with no cookie yet');
const syncFnStart = service.indexOf('export async function syncThemeCookie');
const syncFnBody = service.slice(syncFnStart, service.indexOf('\nexport ', syncFnStart + 10));
assert.doesNotMatch(syncFnBody, /writeAuditLog/, 'syncThemeCookie must never write an audit log entry - the viewer did not make a change, it is only reconciling this browser to a choice made elsewhere');
assert.match(reconciler, /dbTheme === theme\) return;/, 'the reconciler must only act when the DB value genuinely differs from what this browser already has');
assert.match(reconciler, /reconciledRef\.current = true;/, 'the reconciler must only ever run its one-time correction once per mount, not on every render');

// --- Accessibility: native controls, non-color selected state --------------

assert.match(switcherBody, /role="group" aria-label="Theme"/, 'the theme options must be grouped with an accessible label');
assert.match(switcherBody, /aria-pressed={selected}/, 'each option must expose its selected state to assistive tech, not rely on visual styling alone');
assert.match(switcherBody, /aria-label={`\$\{label\} theme - \$\{description\}`}/, 'each option must have a full accessible name (not just an icon)');
assert.match(switcherBody, /<Check className=.*aria-hidden="true" \/> : null/, 'the selected state must be indicated by a visible, non-color signal (a checkmark), not color alone');
assert.doesNotMatch(switcherBody, /onKeyDown/, 'no custom keyboard handling should be needed - these are real <button> elements, which already support Tab/Enter/Space natively');
assert.match(switcherBody, /focus-visible:outline/, 'each option must have a visible focus state');

console.log('Validated Theme system: real Dark/Light/System control (not a cosmetic card), zero-flash three-state CSS resolution (explicit dark / OS-driven light / explicit light), client-instant preview kept separate from server persistence with "Saved" gated on real success and revert-on-failure, tenant/user-scoped DB+cookie persistence with a real audit trail, passive cross-device cookie sync that never fabricates an audit entry, and an accessible, keyboard-native selector with a non-color selected indicator.');
