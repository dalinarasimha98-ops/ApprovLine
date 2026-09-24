/**
 * Single source of truth for "is this an ApprovalRecord that was written by
 * a seed/demo script, not captured from a real connected source." Three
 * seed paths coexist in this codebase and only one of them is reliably
 * detectable by sourceLink alone:
 *
 * - lib/demo-data.ts (the "Generate demo data" button / /api/demo/seed)
 *   tags its sourceLink with 'demo'/'TDEMO' substrings by design.
 * - scripts/seed-demo-approvals.ts deliberately uses realistic-looking
 *   sourceLinks with no 'demo'/'TDEMO' substring (its own doc comment: "not
 *   tagged with 'demo'/'TDEMO'") - that realism is the point for sales
 *   demos, so the URL itself will never carry a tell. It does, however,
 *   always stamp ApprovalRecord.correlationId as `${SEED_RUN_ID}:...`.
 * - prisma/seed.ts (npm run db:seed) sets neither a sourceLink nor a
 *   'demo'/'TDEMO'-tagged field - it now stamps correlationId as
 *   'prisma-seed-v1:<subject>' for the same reason.
 *
 * Checking sourceLink alone (the pre-existing check duplicated across
 * ApprovalTable, the full approval detail page, services/investigations.ts,
 * services/memory.ts, and the CSV export route) is why seed-demo-approvals.ts
 * output rendered with no "Demo" badge at all next to lib/demo-data.ts rows
 * that did - inconsistent, not absent, labeling. Checking correlationId too
 * closes that gap without touching either seed script's URL realism.
 */

const SEED_CORRELATION_PREFIXES = ['seed-demo-approvals-v', 'prisma-seed-v'];

function isDemoSourceLink(value?: string | null): boolean {
  return Boolean(value && (value.includes('demo') || value.includes('TDEMO')));
}

function isDemoCorrelationId(value?: string | null): boolean {
  if (!value) return false;
  return SEED_CORRELATION_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function isDemoApprovalRecord(record: { sourceLink?: string | null; correlationId?: string | null }): boolean {
  return isDemoSourceLink(record.sourceLink) || isDemoCorrelationId(record.correlationId);
}
