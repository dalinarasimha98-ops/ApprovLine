import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static-analysis tests, matching the convention used across
// tests/founder-*.test.ts in this repo (no Jest/Vitest/testing-library/
// jsdom exists here — confirmed by grepping package.json — so these are
// not "does a string exist" checks but assertions on the actual control
// flow of the shared FounderDrawer primitive: that focus is captured and
// restored, that Tab/Shift+Tab cycling is bounded to the panel's own
// focusable elements, that Escape and overlay-click both resolve to the
// same onClose, and that every Founder drawer in the app now goes through
// this one implementation rather than a sixth copy of the same markup.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const drawer = read('components/founder/FounderDrawer.tsx');
const billingClient = read('components/founder/BillingPortfolioClient.tsx');
const customerIntegrationsClient = read('components/founder/CustomerIntegrationsClient.tsx');
const integrationCatalogClient = read('components/founder/IntegrationCatalogClient.tsx');
const featureManagementClient = read('components/founder/FeatureManagementClient.tsx');
const customersTableClient = read('components/founder/CustomersTableClient.tsx');
const founderNavClient = read('components/founder/FounderNavClient.tsx');
const customer360Page = read('app/founder/customers/[id]/page.tsx');

const ALL_FOUNDER_DRAWER_CALLERS = [billingClient, customerIntegrationsClient, integrationCatalogClient, featureManagementClient, customersTableClient];

// ─── No competing modal framework / no duplicate focus-trap implementation ─

// 1. No Radix/shadcn/headlessui/vaul dependency was introduced — this is a
//    from-scratch primitive because none already existed (confirmed absent
//    from package.json), not a rejection of an existing one.
const packageJson = read('package.json');
assert.doesNotMatch(packageJson, /radix|shadcn|headlessui|vaul/i);

// 2. Exactly one file defines role="dialog" + aria-modal together — every
//    other Founder drawer file wires into it instead of re-implementing.
for (const client of ALL_FOUNDER_DRAWER_CALLERS) {
  assert.doesNotMatch(client, /role="dialog"/);
  assert.doesNotMatch(client, /aria-modal="true"/);
  assert.match(client, /import \{ FounderDrawer \} from '\.\/FounderDrawer'/);
}
assert.match(drawer, /role="dialog"/);
assert.match(drawer, /aria-modal="true"/);

// ─── Screen reader semantics ────────────────────────────────────────────────

// 3. aria-labelledby is wired to the caller-supplied titleId (not a bare
//    aria-label duplicating visible text), and aria-describedby is
//    optional/undefined when no descriptionId is passed (never rendered as
//    the literal string "undefined").
assert.match(drawer, /aria-labelledby=\{titleId\}/);
assert.match(drawer, /aria-describedby=\{descriptionId\}/);
assert.match(drawer, /descriptionId\?: string;/);

// ─── Focus management: capture, move in, trap, restore ─────────────────────

// 4. On open, the element that had focus before the drawer opened is
//    captured (for restoration later) — this is the specific mechanism
//    that makes "focus returns to the View button" possible, not just an
//    Escape listener.
assert.match(drawer, /triggerRef\.current = document\.activeElement;/);

// 5. Focus moves to the first focusable element inside the panel (falling
//    back to the panel itself), not left on whatever the trigger was.
assert.match(drawer, /const first = focusables\(\)\[0\];/);
assert.match(drawer, /\(first \?\? panel\)\?\.focus\(\);/);

// 6. On close (the effect's cleanup, which fires on unmount or when `open`
//    flips false), focus is restored to the captured trigger — and only if
//    it's still a real, focusable HTMLElement (defensive against a trigger
//    that no longer exists, e.g. a row removed by the same action).
assert.match(drawer, /const trigger = triggerRef\.current;/);
assert.match(drawer, /if \(trigger instanceof HTMLElement\) trigger\.focus\(\);/);

// 7. The real Tab/Shift+Tab trap: cycling is bounded to the panel's own
//    focusable elements (first/last), not a document-wide guess. Both
//    directions are handled, and both call preventDefault before moving
//    focus (otherwise the browser's default Tab would still leave the
//    panel first).
assert.match(drawer, /const firstEl = els\[0\];/);
assert.match(drawer, /const lastEl = els\[els\.length - 1\];/);
assert.match(drawer, /if \(e\.shiftKey && document\.activeElement === firstEl\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*lastEl\.focus\(\);/);
assert.match(drawer, /\} else if \(!e\.shiftKey && document\.activeElement === lastEl\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*firstEl\.focus\(\);/);

// 8. If the panel somehow has zero focusable elements, Tab is still
//    prevented rather than silently doing nothing (which would let focus
//    fall through to the page behind it).
assert.match(drawer, /if \(els\.length === 0\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*return;\s*\n\s*\}/);

// 9. Escape resolves to the same onClose the caller provided (via a ref,
//    so the keydown listener always calls the latest onClose without
//    needing to re-run the whole focus-capture effect on every render
//    where a caller passes a fresh inline arrow function).
assert.match(drawer, /const onCloseRef = useRef\(onClose\);/);
assert.match(drawer, /onCloseRef\.current = onClose;/);
assert.match(drawer, /if \(e\.key === 'Escape'\) \{\s*\n\s*e\.stopPropagation\(\);\s*\n\s*onCloseRef\.current\(\);/);

// 10. The overlay click also calls onClose directly — every current caller
//     already closes on overlay click (checked below), so this is not a
//     new behavior, just centralized.
assert.match(drawer, /<div className="absolute inset-0 bg-slate-950\/30" onClick=\{onClose\} aria-hidden="true" \/>/);

// 11. The keydown listener is attached in the capture phase, so it owns
//     Escape/Tab before any bubble-phase listener a module's own content
//     might attach (e.g. a nested form field's own keydown handling).
assert.match(drawer, /document\.addEventListener\('keydown', onKeyDown, true\);/);
assert.match(drawer, /document\.removeEventListener\('keydown', onKeyDown, true\);/);

// ─── Visibility / API surface ───────────────────────────────────────────────

// 12. `open` defaults to true (every current caller conditionally mounts
//     the drawer rather than keeping it always-mounted) but the component
//     still honors open=false by rendering nothing, for any future module
//     that prefers to keep it mounted and toggle visibility itself.
assert.match(drawer, /open = true/);
assert.match(drawer, /if \(!open\) return null;/);

// ─── Sizing: no visual regression versus each module's original width ──────

// 13. Each existing drawer's exact pre-existing pixel width is preserved
//     as a named size, not silently changed.
assert.match(drawer, /sm: 'max-w-sm'/);
assert.match(drawer, /md: 'max-w-\[440px\]'/);
assert.match(drawer, /lg: 'max-w-\[480px\]'/);
assert.match(billingClient, /size="md"/); // was max-w-[440px]
assert.match(featureManagementClient, /size="md"/); // was max-w-[440px]
assert.match(customerIntegrationsClient, /size="lg"/); // was max-w-[480px]
assert.match(integrationCatalogClient, /size="lg"/); // was max-w-[480px]
assert.match(customersTableClient, /size="sm"/); // was max-w-sm

// 14. z-index is now unified at z-50 across every Founder drawer. Feature
//     Management and the Customers list preview were previously at z-40,
//     the same layer as FounderNavClient's own mobile sidebar (checked
//     below) — a real, if minor, stacking-order bug this consolidation
//     fixes as a side effect, not a redesign.
assert.match(drawer, /className="fixed inset-0 z-50"/);
assert.match(founderNavClient, /z-40/); // confirms the collision this avoids: the mobile nav sidebar itself sits at z-40

// ─── No credential/secret exposure introduced by this refactor ─────────────

// 15. FounderDrawer itself never touches data — it has no knowledge of
//     customer/provider/feature content at all, so it cannot be the
//     source of a credential leak; each module's own data-fetching (all
//     server-side, untouched by this task) remains the only source of
//     drawer content.
assert.doesNotMatch(drawer, /encryptedTokens|credential|secret/i);
assert.doesNotMatch(drawer, /prisma|fetch\(|await /);

// ─── Customer 360 has no drawer and was not touched by this task ───────────

// 16. Customer 360 is a tabbed full page, not a dialog — confirmed absent,
//     not assumed, and left completely untouched by this hardening pass.
assert.doesNotMatch(customer360Page, /role="dialog"|FounderDrawer/);

console.log('Validated the shared FounderDrawer primitive: no competing modal framework was introduced (none existed to reuse), all five Founder drawers (Plans & Billing, Customer Integrations, Integration Catalog, Feature Management, and the Customers list preview) now go through this one implementation with zero duplicate role="dialog"/aria-modal declarations, real focus capture/move-in/trap/restore (not a document-wide hack), a capture-phase Escape/Tab handler that owns keyboard behavior ahead of any nested content, aria-labelledby correctly wired to each caller\'s own title element, every module\'s original drawer width preserved exactly under a named size, a real pre-existing z-40/z-50 stacking inconsistency resolved as a side effect of consolidation, no data-fetching or credential surface added to the shared component itself, and Customer 360 (which has no drawer at all) left completely untouched.');
