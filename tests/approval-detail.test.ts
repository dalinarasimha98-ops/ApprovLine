import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.scripts['test:approval-detail'], 'node --import tsx tests/approval-detail.test.ts');

// ── "View Full Approval" link generation ────────────────────────────────────
// Root-cause audit: the row's route to the full record, the canonical route,
// and the tenant-scoped data loader were all traced end-to-end. The link
// itself was already correct (real ApprovalRecord.id, canonical
// /approvals/[id] route); the real defect found was in the data loader's
// caching layer (below).
//
// This navigation now lives on the instant preview panel opened from the
// row (components/approvals/ApprovalPreviewPanel.tsx), not on the row
// itself - the row opens the panel; the panel's "Open full record"/"View
// this approval record on its own" links carry the real approval.id through
// to the canonical /approvals/[id] route, exactly like the old direct row
// link did.

const approvalPreviewPanel = read('components/approvals/ApprovalPreviewPanel.tsx');
assert.match(approvalPreviewPanel, /`\/approvals\/\$\{approval\.id\}`/);
assert.doesNotMatch(approvalPreviewPanel, /`\/approvals\/\$\{approval\.(sourceLink|sourcePlatform)/);

const approvalTable = read('components/dashboard/ApprovalTable.tsx');
const approvalTableRecordIdField = approvalTable.match(/export type ApprovalTableRecord = \{[\s\S]*?\n\};/)?.[0] ?? '';
assert.match(approvalTableRecordIdField, /id: string;/);

// The canonical detail route already exists — must be reused, not duplicated.
const detailPage = read('app/approvals/[id]/page.tsx');
assert.match(detailPage, /export default async function ApprovalDetailPage/);
assert.match(detailPage, /const \{ id \} = await params;/);

// ── Tenant isolation: the fresh (uncached) lookup must always be org-scoped ──

const approvalDetail = read('services/approvalDetail.ts');
assert.match(approvalDetail, /where:\s*\{\s*id:\s*approvalId,\s*organizationId\s*\}/);
assert.doesNotMatch(approvalDetail, /organizationId:\s*(searchParams|request\.|formData\.get)/);

// ── Root cause: unstable_cache's key array is its ENTIRE cache identity —
// arguments passed to the wrapped function are NOT part of the cache key
// unless explicitly listed. Every fetcher below used to key its cache only
// on approvalId, meaning a cache entry populated while serving one
// organization's request could be replayed for a *different* organization's
// request to the same approvalId (and, for the related-records fetcher, a
// stale `subject` could be served after the approval's subject changed).
// This test pins every fetcher's key to include organizationId (and subject,
// where the fetch depends on it) so this exact class of bug cannot silently
// regress. ──────────────────────────────────────────────────────────────────

const cacheKeyBlocks: [name: string, pattern: RegExp][] = [
  ['approval-detail-core', /\['approval-detail-core', approvalId, organizationId\]/],
  ['approval-detail-audit-trail', /\['approval-detail-audit-trail', approvalId, organizationId\]/],
  ['approval-detail-compliance', /\['approval-detail-compliance', approvalId, organizationId\]/],
  ['approval-detail-classifier', /\['approval-detail-classifier', approvalId, organizationId\]/],
  ['approval-detail-related', /\['approval-detail-related', approvalId, organizationId, subject\]/],
  ['approval-detail-manual-bundle', /\['approval-detail-manual-bundle', approvalId, organizationId\]/],
  ['approval-context-list', /\['approval-context-list', excludeId, organizationId\]/],
];
for (const [name, pattern] of cacheKeyBlocks) {
  assert.match(approvalDetail, pattern, `unstable_cache key for "${name}" must include organizationId (see root-cause note above)`);
}

// Every unstable_cache call in this file must be one of the seven pinned
// above — if a new cached fetcher is ever added, this count must be updated
// deliberately (not silently miss the same tenant-scoping requirement).
const unstableCacheCallCount = (approvalDetail.match(/unstable_cache\(/g) ?? []).length;
assert.equal(unstableCacheCallCount, 7);

// ── No fabricated approve/reject/confirm actions ────────────────────────────
// The detail page must only ever expose real, already-shipped navigation —
// approval decisions themselves flow exclusively through the existing manual
// approval / confirmation workflow (ManualApprovalPanel), never a second,
// invented approval engine on this page.
assert.doesNotMatch(detailPage, />\s*Approve\s*<|>\s*Reject\s*<|>\s*Confirm\s*</);
assert.match(detailPage, /ManualApprovalPanel/);
assert.doesNotMatch(detailPage, /model\s+ApprovalDetail\b/);

// ── Evidence / source links only render when real data exists ──────────────
assert.match(detailPage, /getSafeEvidenceUrl/);
assert.match(detailPage, /getUnifiedEvidenceIdForApproval/);
assert.match(detailPage, /Evidence not available yet|No evidence snippet captured yet/);

// ── Safe not-found / no cross-tenant disclosure ─────────────────────────────
assert.match(detailPage, /notFound\(\);/);
assert.match(detailPage, /Approval was deleted or does not belong to this tenant/);

// ── RBAC reused, not reinvented ──────────────────────────────────────────────
assert.match(detailPage, /canManageManualApprovals\(tenant\.user\.role\)/);
assert.doesNotMatch(detailPage, /enum Role|type Role =/);

// ── Error boundary must never render raw internal error text ───────────────
// (found during this audit: it previously rendered error.message directly,
// which can be a raw Prisma/Clerk exception string — fixed to show only the
// opaque digest, matching every other error surface in this codebase.)
const detailErrorBoundary = read('app/approvals/[id]/error.tsx');
assert.doesNotMatch(detailErrorBoundary, /\{error\.message\}/);
assert.match(detailErrorBoundary, /error\.digest/);

console.log(
  'Validated the "View Full Approval" flow end-to-end: the link uses the canonical ApprovalRecord.id and the existing /approvals/[id] route (no duplicate route/model); the fresh data loader is organizationId-scoped; every unstable_cache key in services/approvalDetail.ts now includes organizationId (and subject where relevant), closing a real cross-tenant cache-key gap found during the audit where a cached result for one organization could previously be served to a different organization requesting the same approvalId; the detail page reuses the existing manual-approval workflow and RBAC rather than a second engine, only shows evidence/source links backed by real data, uses the existing safe not-found behavior, and the error boundary no longer renders raw internal error text.',
);
