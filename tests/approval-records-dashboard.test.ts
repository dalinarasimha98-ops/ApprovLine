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
assert.doesNotMatch(approvalsPage, /Approval records are taking longer than expected/);

const approvalRecords = read('lib/approvalRecords.ts');
assert.match(approvalRecords, /approvalRecordListSelect/);
assert.match(approvalRecords, /satisfies Prisma\.ApprovalRecordSelect/);
assert.match(approvalRecords, /take:\s*Math\.min\(filters\.limit \?\? 50, 100\)/);
assert.match(approvalRecords, /filters\.timeoutMs \?\? 4500/);
assert.match(approvalRecords, /source: 'cache'/);
assert.match(approvalRecords, /source: 'empty'/);
assert.match(approvalRecords, /Showing recently loaded approval records/);
assert.match(approvalRecords, /Approval records are temporarily unavailable/);
assert.match(approvalRecords, /organizationId: filters\.organizationId/);
assert.match(approvalRecords, /orderBy:\s*\[\{ occurredAt: 'desc' \}, \{ createdAt: 'desc' \}\]/);
assert.doesNotMatch(approvalRecords, /classifierResults:\s*true/);
assert.doesNotMatch(approvalRecords, /auditLogs:\s*true/);
assert.doesNotMatch(approvalRecords, /investigations:\s*true/);
assert.doesNotMatch(approvalRecords, /complianceEvaluations:\s*true/);

const performance = read('lib/performance.ts');
assert.match(performance, /clearTimeout\(timeout\)/);

console.log('Validated approval dashboard timeout fallback, lean query shape, and non-blocking recovery UI.');
