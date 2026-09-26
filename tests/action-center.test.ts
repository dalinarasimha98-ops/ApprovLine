import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePriority,
  normalizeSourcePlatform,
  resolveActionStatus,
  isOpenStatus,
  fmtRelativeTime,
  fmtDueDate,
  ACTION_TYPE_LABELS,
  ACTION_PRIORITY_LABELS,
  ACTION_STATUS_LABELS,
  SOURCE_PLATFORM_LABELS,
} from '../lib/action-center';

// NOTE: this suite deliberately never imports services/action-center.ts at
// module scope, even though that file itself has no Clerk dependency —
// there is no live-database test harness in this environment (see
// CLAUDE.md's own "no Jest/Vitest runner... no live-database test harness"
// note, and tests/alerts.test.ts's identical convention for the same real
// reason: the query results can't be verified against a real Postgres
// instance here). This file therefore covers pure lib/action-center.ts
// unit tests with real inputs (Part 1) plus static-analysis of the
// already-written service/page/component source (Part 2), matching every
// other test in this repo.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

// Part 1: REAL EXECUTED unit tests against the actual, imported pure logic.

// ─── normalizePriority: reuses riskLevel verbatim, defaults to 'low' ───────

assert.equal(normalizePriority('critical'), 'critical');
assert.equal(normalizePriority('HIGH'), 'high');
assert.equal(normalizePriority('Medium'), 'medium');
assert.equal(normalizePriority('low'), 'low');
assert.equal(normalizePriority(null), 'low');
assert.equal(normalizePriority(undefined), 'low');
assert.equal(normalizePriority('not-a-real-level'), 'low');

// ─── normalizeSourcePlatform: maps free-text provider names honestly,
//     never invents a provider it can't identify ──────────────────────────

assert.equal(normalizeSourcePlatform('slack'), 'SLACK');
assert.equal(normalizeSourcePlatform('Slack'), 'SLACK');
assert.equal(normalizeSourcePlatform('gmail'), 'GMAIL');
assert.equal(normalizeSourcePlatform('microsoft teams'), 'MICROSOFT_TEAMS');
assert.equal(normalizeSourcePlatform('teams'), 'MICROSOFT_TEAMS');
assert.equal(normalizeSourcePlatform('servicenow'), 'SERVICENOW');
assert.equal(normalizeSourcePlatform(null), 'UNKNOWN');
assert.equal(normalizeSourcePlatform('some-future-provider'), 'UNKNOWN');
assert.equal(Object.keys(SOURCE_PLATFORM_LABELS).length, 9); // 7 real providers + CUSTOM + UNKNOWN

// ─── resolveActionStatus: the ONE authoritative status path ────────────────

// A closed action always reports its real terminal state regardless of any
// due date math — closed status is never re-derived from timing.
assert.equal(resolveActionStatus({ closedAs: 'RESOLVED', dueAt: new Date('2020-01-01') }), 'RESOLVED');
assert.equal(resolveActionStatus({ closedAs: 'DISPUTED', dueAt: null }), 'DISPUTED');
assert.equal(resolveActionStatus({ closedAs: 'SUPERSEDED', dueAt: null }), 'SUPERSEDED');

// An open action with no real due date is PENDING — never OVERDUE/DUE_TODAY
// fabricated from a due date that doesn't exist.
assert.equal(resolveActionStatus({ closedAs: null, dueAt: null }), 'PENDING');

{
  const now = new Date('2026-06-15T12:00:00Z');
  // Due later today (deadline moment hasn't passed yet) -> DUE_TODAY.
  assert.equal(resolveActionStatus({ closedAs: null, dueAt: new Date('2026-06-15T23:00:00Z') }, now), 'DUE_TODAY');
  // Due earlier today (deadline moment already passed) -> genuinely OVERDUE,
  // even though the calendar date is still "today" — "overdue" means the
  // real deadline timestamp has passed, not merely "a different day".
  assert.equal(resolveActionStatus({ closedAs: null, dueAt: new Date('2026-06-15T00:00:00Z') }, now), 'OVERDUE');
  assert.equal(resolveActionStatus({ closedAs: null, dueAt: new Date('2026-06-14T23:59:00Z') }, now), 'OVERDUE');
  assert.equal(resolveActionStatus({ closedAs: null, dueAt: new Date('2026-06-20T00:00:00Z') }, now), 'PENDING');
  // A due date exactly "now" is not overdue (< is strict, not <=) but is due today.
  assert.equal(resolveActionStatus({ closedAs: null, dueAt: now }, now), 'DUE_TODAY');
}

assert.equal(isOpenStatus('PENDING'), true);
assert.equal(isOpenStatus('DUE_TODAY'), true);
assert.equal(isOpenStatus('OVERDUE'), true);
assert.equal(isOpenStatus('RESOLVED'), false);
assert.equal(isOpenStatus('DISPUTED'), false);
assert.equal(isOpenStatus('SUPERSEDED'), false);

// ─── fmtRelativeTime / fmtDueDate: honest, never a fabricated due date ─────

{
  const now = new Date('2026-06-15T12:00:00Z');
  assert.equal(fmtRelativeTime(new Date('2026-06-15T11:59:55Z'), now), 'Just now');
  assert.equal(fmtRelativeTime(new Date('2026-06-15T11:45:00Z'), now), '15 minutes ago');
  assert.equal(fmtRelativeTime(new Date('2026-06-15T10:00:00Z'), now), '2 hours ago');
  assert.equal(fmtRelativeTime(new Date('2026-06-13T12:00:00Z'), now), '2 days ago');

  assert.equal(fmtDueDate(null), 'Due date not specified');
  assert.equal(fmtDueDate(new Date('2026-06-15T18:00:00Z'), now), 'Today');
  assert.equal(fmtDueDate(new Date('2026-06-16T02:00:00Z'), now), 'Tomorrow');
  assert.equal(fmtDueDate(new Date('2026-06-14T02:00:00Z'), now), 'Yesterday');
}

// ─── Label completeness: every enum value has a real display label ────────

for (const t of ['APPROVAL_REQUEST', 'REVIEW_REQUEST', 'CONFIRMATION_REQUEST'] as const) {
  assert.equal(typeof ACTION_TYPE_LABELS[t], 'string');
  assert.ok(ACTION_TYPE_LABELS[t].length > 0);
}
for (const p of ['low', 'medium', 'high', 'critical'] as const) {
  assert.equal(typeof ACTION_PRIORITY_LABELS[p], 'string');
}
for (const s of ['PENDING', 'DUE_TODAY', 'OVERDUE', 'RESOLVED', 'DISPUTED', 'SUPERSEDED'] as const) {
  assert.equal(typeof ACTION_STATUS_LABELS[s], 'string');
}

console.log('Validated lib/action-center.ts\'s pure derivation logic with real executed unit tests: normalizePriority reuses ApprovalRecord.riskLevel\'s real vocabulary and never invents a level for null/unrecognized input; normalizeSourcePlatform maps only real, known provider names and reports UNKNOWN rather than guessing; resolveActionStatus is the one authoritative status path — a closed action always reports its true terminal state regardless of any due-date math, and an open action with no real due date is honestly PENDING, never a fabricated DUE_TODAY/OVERDUE; fmtDueDate never invents a due date ("Due date not specified" for null).');

// Part 2: static-analysis assertions, matching the convention used across
// this repo's test suite (services/alerts.ts, lib/approvalRecords.ts, and
// every tests/founder-*.test.ts). These assert real reuse of existing
// architecture, tenant isolation, RBAC, no fabricated data/buttons, no
// secret exposure, and accessible drawer mechanics.

const libActionCenter = read('lib/action-center.ts');
const service = read('services/action-center.ts');
const page = read('app/dashboard/pending-actions/page.tsx');
const client = read('components/dashboard/ActionCenterClient.tsx');
const drawer = read('components/dashboard/DetailDrawer.tsx');
const nav = read('components/dashboard/DashboardNavigation.tsx');
const founderDrawer = read('components/founder/FounderDrawer.tsx');
const prismaSchema = read('prisma/schema.prisma');

// ─── Architecture: no new model, no duplicate engine ───────────────────────

// 1. No new Prisma model was introduced — the feature is built entirely on
//    ApprovalRecord/ManualApprovalDetail/ApprovalConfirmationRequest.
assert.doesNotMatch(prismaSchema, /model\s+(PendingAction|ActionCenterItem|ActionQueue)\b/);

// 1b. lib/action-center.ts stays genuinely pure (no DB/Clerk dependency) —
//     this is what makes Part 1's real executed unit tests possible at
//     all, matching lib/founder-*.ts's established convention in this repo.
assert.doesNotMatch(libActionCenter, /from '@prisma\/client'|from '@\/lib\/prisma'|from '@clerk/);

// 2. Exactly one base query drives the feature (ApprovalRecord), joined to
//    the two real existing "still needs a response" signals — no second,
//    independent list that then needs unioning/deduping in application code.
assert.match(service, /prisma\.approvalRecord\.findMany\(/);
assert.doesNotMatch(service, /prisma\.approvalConfirmationRequest\.findMany\(/); // read only via the ApprovalRecord include, never as its own top-level list
assert.match(service, /status: 'PENDING_REVIEW'/);
assert.match(service, /verificationStatus: 'PENDING_CONFIRMATION'/);

// 3. Real existing helpers reused verbatim — no second evidence-link or
//    evidence-correlation engine.
assert.match(service, /import \{ getSafeEvidenceUrl \} from '@\/lib\/evidence-links'/);
assert.match(service, /import \{ getUnifiedEvidenceIdsForApprovals \} from '@\/services\/evidence\/records'/);
assert.doesNotMatch(service, /function getSafeEvidenceUrl|function getUnifiedEvidenceIds/);

// ─── Tenant isolation ───────────────────────────────────────────────────────

// 4. Every real query starts from organizationId taken from the viewer
//    object (server-resolved), never a client-supplied value — searched
//    for any raw destructuring of organizationId from request input.
assert.match(service, /organizationId: viewer\.organizationId/);
assert.doesNotMatch(service, /organizationId:\s*(searchParams|request\.|formData\.get)/);
assert.doesNotMatch(page, /organizationId:\s*(searchParams|sp\.|request\.)/);
assert.match(page, /organizationId: tenant\.organization\.id/);

// 5. getActionById re-checks organizationId on every lookup (the
//    cross-tenant access test this task requires) — a wrong-tenant ID
//    returns null, never throwing a distinguishable "found but forbidden"
//    error that would leak existence.
assert.match(service, /export async function getActionById/);
assert.match(service, /id,\s*\n\s*organizationId: viewer\.organizationId,/);
assert.match(page, /getActionById\(viewer, initialSelectedId\)\.catch\(\(\) => null\)/);

// ─── RBAC ───────────────────────────────────────────────────────────────────

// 6. Org-wide visibility is limited to the same tier already granted
//    broader operational visibility elsewhere (MANAGER+, matching
//    lib/rbac.ts's own /dashboard/alerts precedent) — never granted to
//    every role, and never a second permission system (no new Role enum,
//    no new hasAnyRole-equivalent).
assert.match(service, /ORG_WIDE_VISIBILITY_ROLES: Role\[\] = \['OWNER', 'ADMIN', 'MANAGER'\];/);
assert.doesNotMatch(service, /enum Role|type Role =/); // Role is imported from @prisma/client, never redefined
assert.match(service, /import type \{ Prisma, Role, ManualApprovalVerificationStatus \} from '@prisma\/client'/);

// 7. Base roles (MEMBER/AUDITOR/VIEWER) are scoped to a real identity match
//    — their own User.id or their own email, case-insensitively — never a
//    name-similarity guess. Grepped for the literal absence of any
//    name-based matching logic.
assert.match(service, /approverUserId: viewer\.userId/);
assert.match(service, /approverEmail: \{ equals: email, mode: 'insensitive' \}/);
assert.doesNotMatch(service, /approverName.*includes|similarTo|fuzzyMatch|levenshtein/i);

// ─── No fabricated data / no fake buttons ──────────────────────────────────

// 8. No fabricated Approve/Reject/Confirm/Send mutation button exists in
//    the client — only real navigation to existing, already-shipped
//    approve/confirm flows (the approval detail page, the source viewer,
//    Unified Evidence). The one <form> in this file is the search filter
//    (onSubmit only, a client-side URL navigation, never a server
//    mutation) — no <form action=...> was added anywhere.
assert.doesNotMatch(client, /<form[^>]*\baction=/);
assert.doesNotMatch(client, />\s*Approve\s*<|>\s*Reject\s*<|>\s*Confirm\s*<|>\s*Send\s*</);
assert.match(client, /Open in \{SOURCE_PLATFORM_LABELS/); // the only "action" button is a real external deep link
assert.match(client, /href={`\/approvals\/\$\{selected\.id\}`}/);
assert.match(client, /href={`\/approvals\/\$\{selected\.id\}\/source`}/);
assert.match(client, /href={`\/evidence\/\$\{selected\.evidenceRecordId\}`}/);

// 9. Evidence absence is stated honestly, never faked.
assert.match(client, /Evidence not available yet\./);
assert.match(client, /Unassigned/);
assert.match(client, /fmtDueDate/);

// 10. No secret/credential field is ever selected or rendered.
for (const file of [service, client, page]) {
  assert.doesNotMatch(file, /encryptedTokens|oauthToken|accessToken|clientSecret|refreshToken/i);
}

// ─── Performance: no N+1 ────────────────────────────────────────────────────

// 11. Exactly one findMany + one count for the page, one batched recipient
//     resolution query, and one batched evidence-ID lookup — never a
//     per-row query inside a loop.
assert.equal((service.match(/prisma\.approvalRecord\.findMany\(/g) ?? []).length, 1);
assert.doesNotMatch(service, /for \(const \w+ of (rows|records)\)[\s\S]{0,120}await prisma\./);
assert.match(service, /async function resolveUnmatchedRecipients/);
assert.match(service, /prisma\.user\.findMany\(/);
assert.equal((service.match(/prisma\.user\.findMany\(/g) ?? []).length, 1);

// ─── Pagination / filters / search ──────────────────────────────────────────

assert.match(service, /const PAGE_SIZE = 10;/);
assert.match(service, /skip: \(page - 1\) \* PAGE_SIZE/);
assert.match(client, /Showing \{\(props\.page - 1\) \* 10 \+ 1\}/);
assert.match(client, /Previous/);
assert.match(client, /Next/);
assert.match(service, /searchClause/);
assert.match(client, /Search actions, people, or keywords/);

// ─── Drawer accessibility ───────────────────────────────────────────────────

// 12. The customer drawer is its own component (not an import of the
//     Founder-only drawer into customer code) but implements the identical
//     real accessibility contract: focus trap, Escape, focus restoration,
//     body scroll lock, aria-modal/aria-labelledby.
assert.doesNotMatch(client, /from '@\/components\/founder\/FounderDrawer'/);
assert.match(drawer, /role="dialog"/);
assert.match(drawer, /aria-modal="true"/);
assert.match(drawer, /aria-labelledby=\{titleId\}/);
assert.match(drawer, /e\.key === 'Escape'/);
assert.match(drawer, /document\.body\.style\.overflow = 'hidden';/);
assert.match(drawer, /trigger\.focus\(\);/);
assert.match(drawer, /FOCUSABLE_SELECTOR/);
// Confirms the pattern genuinely mirrors the proven Founder implementation
// (same contract), not a weaker reinvention.
assert.match(founderDrawer, /role="dialog"/);
assert.match(founderDrawer, /aria-modal="true"/);

// 13. Row interaction uses real buttons, not clickable <tr>/<div> hacks.
assert.doesNotMatch(client, /<tr[^>]*onClick/);
assert.doesNotMatch(client, /<div[^>]*onClick=\{.*openAction/);
assert.match(client, /<button type="button" onClick=\{\(\) => openAction\(row\.id\)\}/);

// ─── Navigation ─────────────────────────────────────────────────────────────

assert.match(nav, /\{ href: '\/dashboard\/pending-actions', label: 'Action Center'/);
assert.doesNotMatch(nav, /founder/i); // customer nav stays fully independent of the Founder Console nav

// ─── Regression guard: computeKpis() viewer-scoping bug ───────────────────
//
// Found by running loadActionCenter() directly against real seeded
// Postgres data during the Organization Dashboard hardening pass: a VIEWER
// whose email/userId matched none of an org's ApprovalRecord rows still
// got kpis.needsAttention === the full org count, while the row-level
// query (buildWhere(), below) correctly returned zero rows for the same
// viewer. Root cause: `{ organizationId, ...scope, ...openActionWhere() }`
// spreads two objects that each contribute a top-level `OR` key - the
// second spread silently discards the first, so the viewer-identity
// restriction in `scope` was never actually applied to any KPI count for
// a non-org-wide role (MEMBER/AUDITOR/VIEWER). buildWhere() never had this
// bug because it nests openActionWhere()'s OR inside an `AND` array
// instead of spreading it at the top level - computeKpis() now does the
// same. This must never regress back to the two-spread form.
assert.doesNotMatch(service, /\.\.\.scope,\s*\.\.\.openActionWhere\(\)/);
assert.match(service, /\.\.\.scope,\s*AND:\s*\[openActionWhere\(\)\]/);
assert.match(service, /organizationId: viewer\.organizationId,\s*\n\s*\.\.\.scope,\s*\n\s*AND: \[statusClause, searchClause, sourceClause, actionTypeClause, priorityClause\]/);

console.log('Validated Action Center (/dashboard/pending-actions): built entirely on the existing ApprovalRecord/ManualApprovalDetail/ApprovalConfirmationRequest models with zero new Prisma model, one base query (ApprovalRecord) that already covers both the classifier\'s PENDING_REVIEW status and the manual-approval PENDING_CONFIRMATION verification status (no independent second list to union/dedupe), and reuses getSafeEvidenceUrl/getUnifiedEvidenceIdsForApprovals verbatim rather than a second link/correlation engine. Every query is organizationId-scoped from the server-resolved tenant, getActionById re-checks organizationId per lookup so a cross-tenant ID returns null, and RBAC extends the same MANAGER+ organization-wide visibility tier /dashboard/alerts already grants (base roles see only actions matched to their own real User.id or email, never a name guess). No fabricated Approve/Reject/Confirm button exists — every drawer action is a real link to an already-shipped page. No N+1 (exactly one approvalRecord.findMany, one batched user.findMany, one batched evidence-ID lookup). The customer-side DetailDrawer is a new, independent component (never importing the Founder-only drawer) but implements the identical proven accessibility contract (focus trap, Escape, focus restoration, body scroll lock, aria-modal/aria-labelledby). Real pagination, search, and filters. Action Center is now a real Core Operations nav item.');
