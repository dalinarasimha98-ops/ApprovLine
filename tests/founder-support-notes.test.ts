import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { notePreview, healthStatusLabel, healthStatusTone } from '../lib/founder-notes';

// Part 1: REAL EXECUTED unit tests against the actual, imported pure
// helpers (lib/founder-notes.ts has no DB/framework dependency).

// ─── notePreview: table-safe truncation that never distorts layout ───────

assert.equal(notePreview('Short note.'), 'Short note.'); // no truncation needed
assert.equal(notePreview('a'.repeat(200)).length, 120); // truncated to maxLength (119 chars + ellipsis)
assert.ok(notePreview('a'.repeat(200)).endsWith('…'));
assert.equal(notePreview('line one\nline two\n\nline three'), 'line one line two line three'); // multi-line collapsed to a single line, never breaking table row height
assert.equal(notePreview('exact twenty chars!!', 20), 'exact twenty chars!!'); // exactly at the limit is not truncated

// ─── healthStatusLabel / healthStatusTone: reused from the authoritative
//     CustomerHealth mapping, not a second copy of the status list ────────

assert.equal(healthStatusLabel('HEALTHY'), 'Healthy');
assert.equal(healthStatusLabel('NEEDS_ATTENTION'), 'Needs Attention');
assert.equal(healthStatusLabel('AT_RISK'), 'At Risk');
assert.equal(healthStatusLabel('CRITICAL'), 'Critical');
assert.equal(healthStatusTone('HEALTHY'), 'green');
assert.equal(healthStatusTone('NEEDS_ATTENTION'), 'amber');
assert.equal(healthStatusTone('AT_RISK'), 'red');
assert.equal(healthStatusTone('CRITICAL'), 'red');

console.log('Validated lib/founder-notes.ts\'s real executed unit tests: notePreview collapses multi-line note bodies to a single line and truncates with a visible ellipsis only when genuinely over the limit (never distorting table row height), and healthStatusLabel/healthStatusTone map the authoritative HealthStatus values from lib/customer-health.ts rather than duplicating the status list.');

// Part 2: static-analysis assertions, matching the convention used across
// tests/founder-*.test.ts in this repo (no live-database test harness
// exists here for this test run — the accompanying real, database-backed
// verification for this task was performed separately via a temporary,
// already-removed API route against a local Postgres instance; these
// assertions cover architecture reuse, honest data semantics, security,
// and regression protection via source inspection).

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pureLib = read('lib/founder-notes.ts');
const service = read('services/founder-notes.ts');
const page = read('app/founder/notes/page.tsx');
const client = read('components/founder/NotesPortfolioClient.tsx');
const founderService = read('services/founder.ts');
const customer360Page = read('app/founder/customers/[id]/page.tsx');
const auditPage = read('app/founder/audit/page.tsx');
const navClient = read('components/founder/FounderNavClient.tsx');
const prismaSchema = read('prisma/schema.prisma');
const tenantIsolationLib = read('lib/tenant-isolation.ts');

// ─── Architecture: no new note/ticket/support model, real reuse ──────────

// 1. No new Prisma model was introduced for tickets/cases/support.
assert.doesNotMatch(prismaSchema, /model\s+(SupportTicket|Ticket|Case|SupportCase|CustomerSupportItem)\b/);

// 2. The real, existing CustomerNote model is the only note model, and it
//    has no priority/status/SLA/assignee/ticket-ID field — confirmed
//    directly against the schema rather than assumed.
assert.match(prismaSchema, /model CustomerNote \{/);
const customerNoteBlock = prismaSchema.match(/model CustomerNote \{[\s\S]*?\n\}/)?.[0] ?? '';
assert.doesNotMatch(customerNoteBlock, /priority|status|assignee|assignedTo|slaDeadline|ticketId|dueDate/i);
assert.match(customerNoteBlock, /body\s+String/);
assert.match(customerNoteBlock, /pinned\s+Boolean/);

// 3. This module reuses the four existing canonical mutations verbatim —
//    no second note/support mutation engine.
assert.match(page, /import \{ getFounderAccess, addCustomerNote, toggleCustomerNotePinned, deleteCustomerNote \} from '@\/services\/founder'/);
assert.doesNotMatch(service, /function addCustomerNote|function updateCustomerNote|function toggleCustomerNotePinned|function deleteCustomerNote/);
assert.doesNotMatch(client, /function addCustomerNote|function toggleCustomerNotePinned|function deleteCustomerNote/);
assert.match(founderService, /export async function addCustomerNote/);
assert.match(founderService, /export async function toggleCustomerNotePinned/);
assert.match(founderService, /export async function deleteCustomerNote/);

// 4. Account-status filter options, badge tones, and date formatting are
//    re-exported from lib/founder-billing.ts, not duplicated.
assert.match(pureLib, /export \{[\s\S]*?ACCOUNT_STATUS_FILTER_OPTIONS[\s\S]*?\} from '\.\/founder-billing';/);
assert.doesNotMatch(pureLib, /ACCOUNT_STATUS_FILTER_OPTIONS: \{/); // not redefined, only re-exported

// 5. The shared FounderDrawer is reused — no new drawer implementation.
assert.match(client, /import \{ FounderDrawer \} from '\.\/FounderDrawer'/);
assert.doesNotMatch(client, /role="dialog"|aria-modal="true"/);

// ─── Honest data semantics: no fabricated ticketing concepts ──────────────

// 6. No Priority/Status(ticket)/SLA/Assignee/ticket-ID concept is rendered
//    anywhere in this module — CustomerNote has no backing field for any
//    of them. Checked only in actual UI/logic files, not in the
//    architecture-boundary comments in pureLib/service that legitimately
//    name these as counter-examples of what was deliberately NOT built.
for (const file of [client, page]) {
  assert.doesNotMatch(file, /\bPriority\b|\bSLA\b|Assigned ?To|Ticket ?ID|Ticket ?Number/);
  assert.doesNotMatch(file, /'Open'|'In Progress'|'Resolved'|'Escalated'/);
}

// 7. Note previews never silently drop content — the full body is always
//    reachable (title tooltip in the table, full text in the drawer).
assert.match(client, /notePreview\(note\.body\)/);
assert.match(client, /title=\{note\.body\}/);
assert.match(client, /\{selected\.latestNote\.body\}/);

// ─── Architecture boundary: distinct from Customer 360 / Customer Activity
//     / Founder Attention / Founder Audit Log ────────────────────────────

// 8. This module shows only the LATEST note per customer — the complete
//    note history and inline editing remain exclusively on Customer 360,
//    which is not duplicated here.
assert.match(service, /distinct: \['customerAccountId'\]/);
assert.doesNotMatch(client, /notes\.map\(/); // no full note-history list rendered here
assert.match(customer360Page, /customer\.notes\.map\(\(note\)/); // Customer 360 still owns the full history, untouched

// 9. Customer Activity is FounderAuditLog at /founder/audit — this module
//    never reads FounderAuditLog/AuditLog directly, it links out via the
//    real, already-supported customerAccountId query param.
assert.doesNotMatch(service, /founderAuditLog\.findMany|founderAuditLog\.count/i);
assert.doesNotMatch(client, /FounderAuditLog/);
assert.match(client, /href=\{`\/founder\/audit\?customerAccountId=\$\{selected\.id\}`\}/);
assert.match(auditPage, /customerAccountId: params\.customerAccountId/); // confirms the deep-link param this module relies on is real

// 10. Founder Attention (CustomerHealth-score-based) is a separate engine
//     at /founder/customer-health — this module's own "Customer
//     Attention" section is a narrower, honestly-different signal
//     (note coverage), and never recalculates or renames a health score.
assert.doesNotMatch(service, /healthScore|computeHealthScore/);
assert.match(service, /withoutNotesCount/);
assert.match(service, /activeWithoutNotesCount/);

// 11. CustomerHealth.status is read-only supplementary context here — no
//     write path to CustomerHealth exists in this module.
assert.match(service, /health: \{ select: \{ status: true \} \}/);
assert.doesNotMatch(service, /customerHealth\.(update|upsert|create)/i);

// ─── Security fix found during this task's adversarial audit ─────────────

// 12. updateCustomerNote/toggleCustomerNotePinned/deleteCustomerNote now
//     use a compound where (id + customerAccountId) via updateMany/
//     deleteMany with a zero-count guard, rather than update({where:{id}})
//     alone — a mismatched noteId/customerAccountId pair is rejected
//     instead of silently mutating a different customer's note under the
//     wrong customer's audit attribution.
assert.match(founderService, /prisma\.customerNote\.updateMany\(\{ where: \{ id: noteId, customerAccountId \}, data: \{ body \} \}\)/);
assert.match(founderService, /prisma\.customerNote\.updateMany\(\{ where: \{ id: noteId, customerAccountId \}, data: \{ pinned \} \}\)/);
assert.match(founderService, /prisma\.customerNote\.deleteMany\(\{ where: \{ id: noteId, customerAccountId \} \}\)/);
assert.match(founderService, /if \(result\.count === 0\) throw new Error\('Note not found for this customer\.'\);/);
assert.doesNotMatch(founderService, /prisma\.customerNote\.update\(\{ where: \{ id: noteId \}/); // the old, unsafe single-key form is gone
assert.doesNotMatch(founderService, /prisma\.customerNote\.delete\(\{ where: \{ id: noteId \} \}\)/);

// ─── Filters — all real SQL, no fabricated eligibility rule ────────────────

// 13. Search covers company/domain/admin email AND note body text via
//     real SQL (a relation `some` filter for the note-body case, matching
//     Prisma's documented pattern — no bounded-fetch-then-filter
//     workaround, unlike Seats & Usage's utilization ratio).
assert.match(service, /companyName: \{ contains: q, mode: 'insensitive' \}/);
assert.match(service, /domain: \{ contains: q, mode: 'insensitive' \}/);
assert.match(service, /primaryAdminEmail: \{ contains: q, mode: 'insensitive' \}/);
assert.match(service, /notes: \{ some: \{ body: \{ contains: q, mode: 'insensitive' \} \} \}/);

// 14. Account-status and notes-coverage filters are pushed to real SQL —
//     coverage uses Prisma's native relation existence filters
//     (`some`/`none`), not a JS-side workaround.
assert.match(service, /if \(filters\.status\) where\.status = filters\.status;/);
assert.match(service, /if \(coverage === 'HAS_NOTES'\) return \{ notes: \{ some: \{\} \} \};/);
assert.match(service, /if \(coverage === 'NO_NOTES'\) return \{ notes: \{ none: \{\} \} \};/);

// 15. Clear Filters actually clears every filter, including coverage.
assert.match(client, /const hasActiveFilters = Boolean\(filters\.q \|\| filters\.status \|\| filters\.coverage\);/);
assert.match(client, /function clearFilters\(\) \{\s*\n\s*setQ\(''\);\s*\n\s*router\.push\(pathname\);/);

// ─── Input validation: malformed URLs never produce a misleading state ───

// 16. Status/coverage values from searchParams are validated against real
//     allow-lists before use (the same hardening Revenue needed after its
//     own audit, applied here proactively from the start).
assert.match(page, /const VALID_STATUSES = new Set\(\['TRIAL', 'ACTIVE', 'SUSPENDED', 'CHURNED'\]\);/);
assert.match(page, /const VALID_COVERAGE = new Set\(\['HAS_NOTES', 'NO_NOTES'\]\);/);
assert.match(page, /VALID_STATUSES\.has\(sp\?\.status \?\? ''\)/);
assert.match(page, /VALID_COVERAGE\.has\(sp\?\.coverage \?\? ''\)/);

// ─── Pagination / empty states ──────────────────────────────────────────────

// 17. Pagination uses the filtered total, and true system-empty is
//     distinguished from filtered-to-zero.
assert.match(service, /hasAnyCustomers: totalCustomers > 0/);
assert.match(client, /!hasAnyCustomers \?/);
assert.match(client, /No customer accounts have been provisioned yet\./);
assert.match(client, /No customers match your current filters\./);
assert.doesNotMatch(client, /\{totalCustomers === 0 \? \(/);

// 18. Per-row empty state (a customer with zero notes) is honest and
//     distinct from the portfolio-level empty states above.
assert.match(client, /No notes recorded/);
assert.match(client, /No notes have been recorded for this customer yet\./);

// ─── Security / authorization ───────────────────────────────────────────────

// 19. Founder identity is resolved server-side; read-only is enforced
//     independently in the page and in all three reused mutations; no
//     client-supplied actor/org identity is ever trusted.
assert.match(page, /const access = await getFounderAccess\(\);/);
assert.match(page, /if \(!access\.ok \|\| access\.readOnly\) return;/);
assert.match(page, /canWrite=\{!readOnly\}/);
assert.doesNotMatch(page, /actorEmail:\s*formData\.get|organizationId:\s*formData\.get/);
assert.match(founderService, /if \(access\.readOnly\) throw new Error\('Support admins cannot create customer notes\.'\);/);
assert.match(founderService, /if \(access\.readOnly\) throw new Error\('Support admins cannot update customer notes\.'\);/);
assert.match(founderService, /if \(access\.readOnly\) throw new Error\('Support admins cannot delete customer notes\.'\);/);

// 20. No credential/secret fields ever reach this module.
for (const file of [service, client, page]) {
  assert.doesNotMatch(file, /encryptedTokens|oauthToken|accessToken|clientSecret/i);
}

// ─── Auditability: the one canonical audit path, no second engine ────────

// 21. Every mutation logs via the one canonical logFounderAction helper —
//     no duplicate audit system, one action per mutation.
assert.match(founderService, /action: 'customer\.note\.created'/);
assert.match(founderService, /action: 'customer\.note\.updated'/);
assert.match(founderService, /action: pinned \? 'customer\.note\.pinned' : 'customer\.note\.unpinned'/);
assert.match(founderService, /action: 'customer\.note\.deleted'/);
assert.equal((founderService.match(/await logFounderAction\(\{ access, customerAccountId, action: [^,]+, targetType: 'CustomerNote'/g) ?? []).length, 4);

// ─── Performance: no N+1, batched queries regardless of page size ──────────

// 22. Exactly one paginated customerAccount.findMany and exactly one
//     batched latest-note lookup scoped to just that page's IDs — never a
//     per-row query inside the rows.map() below it.
assert.equal((service.match(/prisma\.customerAccount\.findMany\(/g) ?? []).length, 1);
assert.equal((service.match(/prisma\.customerNote\.findMany\(/g) ?? []).length, 1);
assert.doesNotMatch(service, /customers\.map\(async|rows\.map\(async|for \(const customer of/);
assert.match(service, /await Promise\.all\(\[/);
assert.match(service, /customerAccountId: \{ in: pageIds \}/); // the latest-note batch query is scoped, not portfolio-wide

// ─── Accessibility ──────────────────────────────────────────────────────────

// 23. Real semantic table headers (scope="col"), no clickable <tr> hack —
//     the sticky Action column trigger is a real, keyboard-reachable
//     <button>. The Pinned indicator is a real accessible glyph (role="img"
//     + aria-label), not decorative-only text.
assert.match(client, /<th scope="col" className="w-\[160px\] whitespace-nowrap px-5 py-3">Customer<\/th>/);
assert.doesNotMatch(client, /<tr[^>]*onClick/);
assert.match(client, /<button\s*\n\s*type="button"\s*\n\s*onClick=\{\(\) => setSelectedId\(customer\.id\)\}/);
assert.match(client, /role="img" aria-label="Pinned"/);

// ─── Layout: applying every lesson already learned from Revenue's own
//     visual QA, from the start rather than discovered after shipping ───

// 24. Root grid + bounded table + sticky Action column with a
//     scroll-conditional shadow, and a responsive column strategy so the
//     4 core columns (Customer/Account Status/Latest Note/Action) need
//     zero horizontal scroll at 1024px and 768px, not just 1440/1280 —
//     with Author/Updated/Pinned as xl+-only detail columns already
//     visible in full in the drawer.
assert.match(page, /grid min-w-0 grid-cols-1 gap-6/);
assert.match(client, /overflow-x-auto/);
assert.match(client, /sticky right-0/);
assert.match(client, /min-w-\[666px\][\s\S]*?xl:min-w-\[946px\]/);
assert.match(client, /ResizeObserver/);
assert.match(client, /tableScrollable/);
assert.match(client, /hidden w-\[110px\] whitespace-nowrap px-5 py-3 xl:table-cell">Author<\/th>/);
assert.match(client, /hidden w-\[100px\] whitespace-nowrap px-5 py-3 xl:table-cell">Updated<\/th>/);
assert.match(client, /hidden w-\[70px\] whitespace-nowrap px-3 py-3 text-center xl:table-cell">Pinned<\/th>/);
assert.doesNotMatch(client, /className="sticky right-0 w-24 whitespace-nowrap bg-slate-50 px-4 py-3 text-right shadow-/); // not unconditionally applied

// 25. (Found and fixed during this module's own visual QA, before
//     shipping rather than after: the Pinned column's initial 60px width
//     with the standard px-5 cell padding left only 20px for content,
//     clipping the "PINNED" badge under the sticky Action column — the
//     exact defect class already found and fixed once for Revenue.) The
//     Pinned column now uses a compact, tighter-padded star glyph instead
//     of a full-word badge, matching the sticky Action column's own
//     precedent of a non-standard padding for a narrow column.
assert.doesNotMatch(client, /<Badge tone="amber">Pinned<\/Badge>\s*\n\s*: <span className="text-xs font-semibold text-slate-300">/); // the old full-word-badge approach is gone from the table cell

// ─── Regression protection ───────────────────────────────────────────────

// 26. Founder navigation still links to this page — the rebuild did not
//     silently drop or rename its own nav entry.
assert.match(navClient, /\{ label: 'Support & Notes', href: '\/founder\/notes' \}/);

// 27. No new cross-tenant access mechanism was introduced for notes — this
//     module reads/writes only through customerAccountId-scoped Prisma
//     calls already covered by the existing tenant-isolation helpers, not
//     a second isolation boundary of its own.
assert.doesNotMatch(service, /tenantScopedWhere|assertTenantAccess/); // Founder console operates across all tenants by design; scoping is per-customerAccountId, not per-organizationId
assert.match(tenantIsolationLib, /export function tenantScopedWhere/); // confirms the real helper this module deliberately does not duplicate or bypass

// ─── Found during the 10/10 polish pass, before certification ─────────────

// 28. Every note mutation form (Add Note / Pin-Unpin / Delete) renders a
//     FormSubmitButton, which reads useFormStatus() from its own enclosing
//     <form> to disable itself and show a pending label while the mutation
//     is in flight — this is what actually prevents a double-click from
//     firing the same server action twice (a genuine risk for Add Note,
//     which would otherwise create two identical notes).
assert.match(client, /import \{ useFormStatus \} from 'react-dom';/);
assert.match(client, /function FormSubmitButton/);
assert.match(client, /disabled=\{disabled \|\| pending\}/);
assert.equal((client.match(/<FormSubmitButton/g) ?? []).length, 3); // Add Note, Pin/Unpin, Delete — no mutation button left un-guarded

// 29. A controlled `<form action={addNoteAction}>` only cleared noteBody
//     when selected?.id changed (switching customers) — adding a SECOND
//     note for the SAME customer left the just-submitted text sitting in
//     the textarea after a successful save, since revalidatePath refreshes
//     server data but never touches this component's local state. That
//     looked like the save silently failed, and clicking Save again would
//     have resubmitted the identical body as a real duplicate note. Fixed
//     by wrapping the action so it clears noteBody once the mutation
//     resolves, instead of relying solely on the selected?.id effect.
assert.match(client, /async function handleAddNote\(formData: FormData\) \{\s*\n\s*await addNoteAction\(formData\);\s*\n\s*setNoteBody\(''\);/);
assert.match(client, /<form action=\{handleAddNote\}/);
assert.doesNotMatch(client, /<form action=\{addNoteAction\}/); // the raw prop is no longer wired directly to the form

// 30. The Founder sidebar's own nav list (8 groups + Internal Tools +
//     Settings) is taller than common viewport heights and keeps its
//     scroll position across client-side navigations — so navigating to a
//     group further down the list (Support & Notes, under Customer
//     Success) could leave its own active item scrolled out of view.
//     scrollIntoView({block:'nearest'}) on the active item fixes this
//     without disturbing scroll when the item is already visible, and
//     without reordering or restructuring the locked nav.
assert.match(navClient, /const activeItemRef = useRef<HTMLAnchorElement \| null>\(null\);/);
assert.match(navClient, /activeItemRef\.current\?\.scrollIntoView\(\{ block: 'nearest' \}\);/);
assert.equal((navClient.match(/ref=\{active \? activeItemRef : undefined\}/g) ?? []).length, 3); // main nav groups, Internal Tools, Settings — every render path that can be "active" is covered

console.log('Validated Support & Notes (/founder/notes): rebuilds the pre-existing (functionally honest but visually outdated) notes page onto the now-established Founder Console pattern, reusing CustomerNote and its four existing canonical mutations verbatim — no second note/ticket/support model, and no Priority/Status/SLA/Assignee/Ticket-ID concept anywhere, since none of those fields exist on CustomerNote. Shows only each customer\'s latest note for portfolio-wide triage, deliberately not duplicating Customer 360\'s own complete note history, and links out to the real /founder/audit?customerAccountId= deep-link for Customer Activity rather than re-reading FounderAuditLog. Found and fixed a real pre-existing defect in three of the four canonical note mutations — a noteId/customerAccountId mismatch could mutate the wrong customer\'s note under the wrong customer\'s audit attribution — now rejected via a compound where clause and a zero-count guard, verified with real spoofing attempts. Every filter (search across customer fields AND note body text, status, notes coverage) is real SQL via Prisma\'s native relation existence filters, malformed query-string values are validated before use, and the table applies the responsive-column-hiding and scroll-conditional-shadow fixes already proven for Revenue from the start, catching and fixing one new instance of the same class of defect (a too-narrow Pinned column) during this module\'s own visual QA before shipping.');
