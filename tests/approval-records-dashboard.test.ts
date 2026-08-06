import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.scripts['test:approval-records'], 'node --import tsx tests/approval-records-dashboard.test.ts');

const approvalsPage = read('app/dashboard/approvals/page.tsx');
assert.match(approvalsPage, /loadDashboardApprovalRecords/);
assert.doesNotMatch(approvalsPage, /prisma\.approvalRecord\.findMany/);
assert.match(approvalsPage, /cacheNotice/);
assert.match(approvalsPage, /Approval records are recovering/);
assert.match(approvalsPage, /AutoRetryOnDegraded/);
assert.doesNotMatch(approvalsPage, /Approval records are taking longer than expected/);

const approvalRecords = read('lib/approvalRecords.ts');
assert.match(approvalRecords, /approvalRecordListSelect/);
assert.match(approvalRecords, /satisfies Prisma\.ApprovalRecordSelect/);
assert.match(approvalRecords, /take:\s*cacheParams\.limit/);
assert.match(approvalRecords, /limit:\s*Math\.min\(filters\.limit \?\? 50, 100\)/);
assert.match(approvalRecords, /unstable_cache/);
assert.match(approvalRecords, /from 'react'/);
assert.match(approvalRecords, /APPROVAL_RECORDS_REVALIDATE_SECONDS = 60/);
assert.match(approvalRecords, /CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3/);
assert.match(approvalRecords, /export function approvalRecordsCacheTag/);
assert.match(approvalRecords, /export function invalidateApprovalRecordsCache/);
assert.match(approvalRecords, /source: 'cache'/);
assert.match(approvalRecords, /source: 'empty'/);
assert.match(approvalRecords, /alert,/);
assert.match(approvalRecords, /Approval records are temporarily unavailable/);
assert.match(approvalRecords, /organizationId: filters\.organizationId/);
assert.match(approvalRecords, /orderBy:\s*\[\{ occurredAt: 'desc' \}, \{ createdAt: 'desc' \}\]/);
assert.doesNotMatch(approvalRecords, /classifierResults:\s*true/);
assert.doesNotMatch(approvalRecords, /auditLogs:\s*true/);
assert.doesNotMatch(approvalRecords, /investigations:\s*true/);
assert.doesNotMatch(approvalRecords, /complianceEvaluations:\s*true/);

// Every ApprovalRecord write path must invalidate the per-org cache tag so
// new/updated approvals are never masked by a stale 60s cache entry.
const writePaths = [
  'services/manual-approvals.ts',
  'services/classifier/persistence.ts',
  'lib/demo-data.ts',
  'services/founderDemoGenerator.ts',
  'app/api/integrations/slack/seed/route.ts',
];
for (const path of writePaths) {
  const contents = read(path);
  assert.match(
    contents,
    /revalidateTag\(approvalRecordsCacheTag\(|invalidateApprovalRecordsCache\(/,
    `${path} must invalidate the approval records cache after writing`,
  );
}

const performance = read('lib/performance.ts');
assert.match(performance, /clearTimeout\(timeout\)/);

console.log('Validated approval dashboard caching, circuit breaker, non-blocking recovery UI, and write-path cache invalidation.');
