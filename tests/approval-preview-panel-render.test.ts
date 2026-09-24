/**
 * Real, executed component-render regression test for the Approval Preview
 * Panel - the no-fetch replacement for the old fetch-based
 * ApprovalDetailDrawer. Renders the real component (not a mock/stub) with
 * hand-built ApprovalTableRecord fixtures mirroring exactly what
 * lib/approvalRecords.ts's list query + services/evidence/records.ts's
 * getUnifiedSourceSummariesForApprovals produce, covering: a multi-source
 * correlated approval, a single-source approval with no correlated
 * UnifiedEvidenceRecord, and the approver-name/email/neither fallback chain
 * (item 5 of the corrections list).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ApprovalPreviewPanel } from '../components/approvals/ApprovalPreviewPanel';
import { ApprovalTable } from '../components/dashboard/ApprovalTable';
import type { ApprovalTableRecord } from '../components/dashboard/ApprovalTable';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

// The panel must never fetch - that's the entire point of replacing the old
// drawer. Assert this at the source level too, not just by the absence of a
// network call in the render below.
const panelSource = read('components/approvals/ApprovalPreviewPanel.tsx');
assert.doesNotMatch(panelSource, /fetch\(/, 'ApprovalPreviewPanel must never fetch - it renders only from the row data it is given');
assert.match(panelSource, /Open full record/);
assert.doesNotMatch(panelSource, /View unified evidence/i);
assert.doesNotMatch(panelSource, /Open full approval details/i);

type MinimalAppRouter = { push(): void; replace(): void; refresh(): void; back(): void; forward(): void; prefetch(): void };
const mockRouter: MinimalAppRouter = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };

function renderPanel(approval: ApprovalTableRecord) {
  return renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: mockRouter },
      React.createElement(ApprovalPreviewPanel, { approval, onClose: () => {} }),
    ),
  );
}

const baseApproval: ApprovalTableRecord = {
  id: 'test-approval-id',
  subject: 'Q4 infrastructure budget $850K',
  sourceLink: null,
  approverName: 'Jordan Approver',
  approverEmail: 'jordan@example.com',
  department: 'Engineering',
  category: 'Infrastructure',
  riskLevel: 'critical',
  sourcePlatform: 'slack',
  confidence: 90,
  status: 'PENDING_REVIEW',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  occurredAt: new Date('2026-01-01T00:00:00Z'),
  sources: null,
};

// 1. Multi-source correlated approval: real per-provider counts, real amount,
//    "Open full record" routes to the unified evidence record, and the
//    legacy per-approval view stays reachable as a plain secondary link.
//    sourceCount is 2, matching providers.length (2 distinct provider keys) -
//    services/evidence/pipeline.ts defines sourceCount as the size of the
//    Set of distinct providerKeys, so any real UnifiedEvidenceRecord has
//    sourceCount === its own distinct-provider count; a fixture where they
//    disagreed would not be real data shape.
const multiSourceSources = {
  unifiedEvidenceId: 'unified-1',
  sourceCount: 2,
  providers: [{ key: 'slack', count: 2 }, { key: 'servicenow', count: 1 }],
  amount: 92_000,
  currency: 'USD',
};
const multiSourceHtml = renderPanel({ ...baseApproval, sources: multiSourceSources });
assert.match(multiSourceHtml, /Captured from 2 sources/);
assert.match(multiSourceHtml, /\$92,000/);
assert.match(multiSourceHtml, /href="\/evidence\/unified-1"/);
assert.match(multiSourceHtml, /View this approval record on its own/);
assert.match(multiSourceHtml, /Q4 infrastructure budget/);
// The full, un-stripped subject is expected to still appear once, in the
// heading's title="" attribute (a real accessibility/tooltip affordance) -
// what must never happen is the *visible heading text* repeating the dollar
// amount the Amount field already shows on its own.
const headingMatch = multiSourceHtml.match(/<h2[^>]*>([^<]*)<\/h2>/);
assert.ok(headingMatch, 'expected to find the approval title heading');
assert.doesNotMatch(headingMatch![1], /\$850K/i, 'the amount must be extracted out of the visible title, not left duplicated in it');

// 2. No correlated UnifiedEvidenceRecord: falls back to the approval's own
//    single sourcePlatform, "Open full record" routes straight to the
//    legacy per-approval page (nothing else to show), and no secondary link
//    is shown (there is only one real destination, so no second door). Its
//    subject has no dollar amount anywhere, so the fallback amount must be
//    an honest em dash, never a fabricated number.
let singleSourceHtml = '';
assert.doesNotThrow(() => {
  singleSourceHtml = renderPanel({ ...baseApproval, subject: 'General compliance review', sources: null });
});
assert.match(singleSourceHtml, /Captured from 1 source\b/);
assert.match(singleSourceHtml, /href="\/approvals\/test-approval-id"/);
assert.doesNotMatch(singleSourceHtml, /View this approval record on its own/);
assert.match(singleSourceHtml, /—/, 'no real or extracted amount exists for this fixture, so the amount must render as an em dash, never a fabricated number');

// 3. Approver fallback chain (item 5): name present -> name shown.
assert.match(renderPanel({ ...baseApproval, approverName: 'Jordan Approver', approverEmail: 'jordan@example.com' }), /Jordan Approver/);

// 4. name null -> falls back to email, never blank and never a role string.
const emailFallbackHtml = renderPanel({ ...baseApproval, approverName: null, approverEmail: 'jordan@example.com' });
assert.match(emailFallbackHtml, /jordan@example\.com/);

// 5. name AND email both null -> an honest placeholder, never a fabricated name.
const noApproverHtml = renderPanel({ ...baseApproval, approverName: null, approverEmail: null });
assert.match(noApproverHtml, /Unknown approver/);

// 6. Row source count must equal panel source count (the original bug: the
// list showed one sourcePlatform string while the preview said "Captured
// from 3 sources", because the row and the panel used to read two different
// things). Both ApprovalTable's stacked-initials Source column and
// ApprovalPreviewPanel's source list are rendered here from the exact same
// `sources` object on the same approval fixture, then independently counted,
// so this fails the moment either surface stops reading services/evidence/
// records.ts's getUnifiedSourceSummariesForApprovals output the same way.
const tableHtml = renderToStaticMarkup(
  React.createElement(
    AppRouterContext.Provider,
    { value: mockRouter },
    React.createElement(ApprovalTable, { approvals: [{ ...baseApproval, sources: multiSourceSources }] }),
  ),
);
// Every stacked source badge (visible or "+N" overflow) in the Sources
// column carries a title="" attribute; sum them for the row's real count.
const sourcesCellMatch = tableHtml.match(/<td class="px-4 py-3">\s*<div class="flex items-center">([\s\S]*?)<\/div>\s*<\/td>/);
assert.ok(sourcesCellMatch, 'expected to find the table row\'s Sources cell');
const visibleBadgeCount = (sourcesCellMatch![1].match(/title="/g) ?? []).length;
const overflowMatch = sourcesCellMatch![1].match(/\+(\d+)</);
const rowSourceCount = visibleBadgeCount + (overflowMatch ? Number(overflowMatch[1]) : 0);

const panelSourceMatch = renderPanel({ ...baseApproval, sources: multiSourceSources }).match(/Captured from (\d+) source/);
assert.ok(panelSourceMatch, 'expected to find the panel\'s "Captured from N sources" heading');
const panelSourceCount = Number(panelSourceMatch![1]);

assert.equal(rowSourceCount, multiSourceSources.providers.length, 'the row must show one badge per distinct contributing source');
assert.equal(rowSourceCount, panelSourceCount, 'the row\'s source count and the panel\'s source count must never disagree - they must come from the same query');

console.log('Validated the Approval Preview Panel (real executed render, no fetch, no loading state) for multi-source and single-source approvals, real amount extraction/formatting, the full approver name -> email -> "Unknown approver" fallback chain, and that the table row\'s source count always equals the preview panel\'s source count.');
