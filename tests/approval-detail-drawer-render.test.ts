/**
 * Real, executed component-render regression test for the Approval Detail
 * Drawer's defensive rendering of optional data (spec: "no evidence, no
 * source URL, no requester, no approver, no manual detail, no related
 * records" must all render a clear empty state, never crash the drawer).
 *
 * ApprovalDetailDrawer itself (components/approvals/ApprovalDetailDrawer.tsx)
 * owns fetch/loading/error state via useEffect, which renderToStaticMarkup
 * never runs (SSR does not execute effects) - so a bare render of that
 * component can only ever be exercised in its pre-fetch "loading" state.
 * ApprovalDetailDrawerBody is the pure, presentational half of the same file
 * (everything rendered once detail data has actually arrived), extracted
 * specifically so it can be rendered directly here with hand-built fixtures
 * mirroring exactly what GET /api/approvals/[id]/detail returns - both a
 * "fully populated" approval and one where every optional field is genuinely
 * absent, matching what a real approval with no manual detail, no source
 * URL, no evidence, no activity, and no related records looks like.
 *
 * This is the same technique tests/approval-detail-render.test.ts already
 * established for ManualApprovalPanel: render real component code with
 * react-dom/server, not a mock/stub or a static string/regex match.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ApprovalDetailDrawerBody, type ApprovalDetail } from '../components/approvals/ApprovalDetailDrawer';

type MinimalAppRouter = { push(): void; replace(): void; refresh(): void; back(): void; forward(): void; prefetch(): void };
const mockRouter: MinimalAppRouter = {
  push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {},
};

function renderTab(data: ApprovalDetail, activeTab: 'overview' | 'evidence' | 'activity' | 'related') {
  return renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: mockRouter },
      React.createElement(ApprovalDetailDrawerBody, { data, activeTab, onTabChange: () => {} }),
    ),
  );
}

const fullData: ApprovalDetail = {
  approval: {
    id: 'test-approval-id',
    subject: 'Vendor contract approval',
    status: 'PENDING_REVIEW',
    approvalType: 'EXPLICIT',
    confidence: 92,
    riskLevel: 'medium',
    department: 'Finance',
    category: 'Procurement',
    approverName: 'Jordan Approver',
    approverEmail: 'jordan@example.com',
    reasoning: 'Vendor contract requires finance sign-off.',
    conditions: 'Subject to legal review.',
    businessImpact: 'Enables the Q3 vendor rollout.',
    evidenceSnippet: 'Approved via email thread on the contract terms.',
    sourcePlatform: 'gmail',
    sourceUrl: 'https://mail.example.com/thread/123',
    sourcePagePath: '/approvals/test-approval-id/source',
    approvalTimestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
  messageSource: {
    provider: 'gmail',
    channel: null,
    sender: 'Jordan Approver',
    senderEmail: 'jordan@example.com',
    receivedAt: new Date().toISOString(),
  },
  manual: {
    kind: 'VERBAL',
    approverRole: 'VP Finance',
    communicationChannel: 'Phone call',
    location: null,
    businessContext: 'Verbal confirmation captured on a call.',
    verificationStatus: 'CONFIRMED_BY_APPROVER',
    confidenceLevel: 80,
    secondPersonRequired: false,
    secondVerifiedAt: null,
    secondVerificationNote: null,
    recorder: { name: 'Riley Recorder', email: 'riley@example.com' },
    secondVerifier: null,
    evidenceCount: 2,
    versionCount: 1,
    confirmationCount: 1,
  },
  unifiedEvidenceId: 'unified-evidence-id',
  activity: [{ id: 'a1', action: 'APPROVAL_CAPTURED', createdAt: new Date().toISOString() }],
  related: {
    investigations: [{ id: 'inv-1', title: 'Vendor spend review', status: 'OPEN' }],
    memoryEntityId: 'memory-1',
    complianceEvaluationCount: 1,
  },
  canManage: true,
  fullPageUrl: '/approvals/test-approval-id',
};

// THE REGRESSION CASE: every optional relation genuinely absent - no
// messageSource, no manual detail, no unified evidence, no evidence
// snippet, no source URL, no activity, no related records. A real approval
// captured without a linked message source or manual-approval workflow
// looks exactly like this.
const emptyData: ApprovalDetail = {
  ...fullData,
  approval: { ...fullData.approval, evidenceSnippet: null, sourceUrl: null, approverName: null, approverEmail: null },
  messageSource: null,
  manual: null,
  unifiedEvidenceId: null,
  activity: [],
  related: { investigations: [], memoryEntityId: null, complianceEvaluationCount: 0 },
};

// 1. Golden path: fully populated data renders real content on every tab.
assert.match(renderTab(fullData, 'overview'), /Vendor contract requires finance sign-off/);
assert.match(renderTab(fullData, 'overview'), /VP Finance/);
assert.match(renderTab(fullData, 'evidence'), /View correlated Unified Evidence record/);
assert.match(renderTab(fullData, 'activity'), /APPROVAL CAPTURED/);
assert.match(renderTab(fullData, 'related'), /Vendor spend review/);

// 2. THE REGRESSION: every optional relation absent, on every tab - must not
//    throw, and must show an honest empty state instead of fabricating data
//    or crashing the whole drawer (matching the exact "Approval Unavailable"
//    failure mode this feature was built to eliminate).
let overviewHtml = '';
assert.doesNotThrow(() => {
  overviewHtml = renderTab(emptyData, 'overview');
}, 'Overview tab must render defensively when requester/approver/manual detail are absent');
assert.match(overviewHtml, /Not assigned/);
assert.match(overviewHtml, /Not recorded/);

let evidenceHtml = '';
assert.doesNotThrow(() => {
  evidenceHtml = renderTab(emptyData, 'evidence');
}, 'Evidence tab must render defensively when no evidence snippet or unified evidence record exists');
assert.match(evidenceHtml, /Evidence not available yet\./);
assert.doesNotMatch(evidenceHtml, /View correlated Unified Evidence record/);

let activityHtml = '';
assert.doesNotThrow(() => {
  activityHtml = renderTab(emptyData, 'activity');
}, 'Activity tab must render defensively when no audit events exist');
assert.match(activityHtml, /No activity recorded yet\./);

let relatedHtml = '';
assert.doesNotThrow(() => {
  relatedHtml = renderTab(emptyData, 'related');
}, 'Related tab must render defensively when no investigations or memory entity exist');
assert.match(relatedHtml, /No related items\./);

console.log(
  'Validated the Approval Detail Drawer (ApprovalDetailDrawerBody, real executed render, not static regex) renders correctly across all four tabs both with fully populated approval data and with every optional relation (message source, manual detail, unified evidence, evidence snippet, activity, related records) genuinely absent -- proving missing optional data produces an honest empty state, never a drawer crash.',
);
