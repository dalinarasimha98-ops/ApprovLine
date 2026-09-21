/**
 * Real, executed component-render regression test for the "View Full
 * Approval -> Approval unavailable" production incident.
 *
 * Root cause: ManualApprovalPanel.tsx accessed `detail.recorder.id`,
 * `detail.recorder.name`, and `version.actorUser.name` directly. Prisma's
 * schema declares ManualApprovalDetail.recorder and
 * ManualApprovalVersion.actorUser as required relations with
 * `onDelete: Restrict`, so TypeScript (correctly, per the schema) types
 * them as non-nullable — but that guarantee only holds for rows written
 * through this application's own Prisma-mediated write paths. Any other
 * production data path (a backfill, a manual data fix, an older row from
 * before a constraint was tightened) can leave a genuinely-corrupted or
 * anomalous row where that relation fails to resolve, and Prisma will
 * return `null` for it at read time regardless of what the schema
 * declares "should" be true. When that happened for one real
 * ApprovalRecord, ManualApprovalPanel threw `Cannot read properties of
 * null (reading 'id')` during CLIENT-SIDE rendering -- a location no
 * server-side try/catch in app/approvals/[id]/page.tsx can catch, since
 * client components hydrate independently of the server component's own
 * async function body. The exception propagated straight to the
 * page-level error boundary (app/approvals/[id]/error.tsx), showing
 * "This approval could not be displayed" for an approval that otherwise
 * loaded and was fully authorized -- exactly the reported bug.
 *
 * Static source-regex assertions (see tests/approval-detail.test.ts) can't
 * catch this class of bug: `detail.recorder.name` and `detail.recorder?.name`
 * both "look like" reasonable code to a regex. Only an actually-executed
 * render with a null relation proves the component survives it. This test
 * renders the real ManualApprovalPanel component (not a mock/stub) with a
 * hand-built prop shape mirroring exactly what
 * app/approvals/[id]/page.tsx's ManualApprovalSection constructs from a
 * Prisma result, once with complete relations and once with recorder/
 * actorUser genuinely null, and asserts neither throws.
 *
 * This file needs the automatic JSX runtime to import a real .tsx
 * component under plain `tsx` (the project's own tsconfig.json correctly
 * sets "jsx": "preserve" for Next's own SWC/webpack build, which isn't
 * what tsx's bare esbuild transform understands) -- see
 * tsconfig.test-render.json and this file's own package.json script.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ManualApprovalPanel } from '../components/approvals/ManualApprovalPanel';

type MinimalAppRouter = { push(): void; replace(): void; refresh(): void; back(): void; forward(): void; prefetch(): void };
const mockRouter: MinimalAppRouter = {
  push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {},
};

function renderPanel(overrides: { recorder: unknown; actorUser: unknown }) {
  const props = {
    approval: {
      id: 'test-approval', subject: 'Test subject', status: 'APPROVED', approvalType: 'EXPLICIT',
      approverName: null, approverEmail: null, approvalTimestamp: new Date().toISOString(),
      conditions: null, department: null, category: null,
    },
    detail: {
      kind: 'VERBAL', approverRole: 'VP Finance', communicationChannel: 'Phone call', location: null,
      businessContext: 'Verbal confirmation captured on a call.', relatedEntityType: null, relatedEntityId: null,
      supportingNotes: null, verificationStatus: 'CONFIRMED_BY_APPROVER', confidenceLevel: 80,
      secondPersonRequired: true, secondVerifierUserId: null, secondVerifiedAt: null, secondVerificationNote: null,
      recorder: overrides.recorder, secondVerifier: null,
    },
    evidence: [],
    versions: [{ id: 'v1', version: 1, changeReason: 'Initial record', createdAt: new Date().toISOString(), previousValues: null, actorUser: overrides.actorUser }],
    confirmations: [],
    canManage: true, currentUserId: 'diag-user', currentUserRole: 'ADMIN',
  };
  return renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: mockRouter },
      React.createElement(ManualApprovalPanel, props as unknown as Parameters<typeof ManualApprovalPanel>[0]),
    ),
  );
}

// 1. The normal path: recorder/actorUser present, as every row written
//    through this app's own write paths guarantees. Must render, and must
//    show the real name.
const normalHtml = renderPanel({
  recorder: { id: 'u1', name: 'Riley Recorder', email: 'riley@example.com' },
  actorUser: { name: 'Riley Recorder', email: 'riley@example.com' },
});
assert.match(normalHtml, /Riley Recorder/);

// 2. THE REGRESSION: recorder/actorUser genuinely null (anomalous
//    production data outside this app's own guarantees). Must NOT throw,
//    and must show an honest fallback instead of fabricating a name.
let anomalousHtml = '';
assert.doesNotThrow(() => {
  anomalousHtml = renderPanel({ recorder: null, actorUser: null });
}, 'ManualApprovalPanel must render defensively when recorder/actorUser are null, not throw and take down the whole approval detail page');
assert.match(anomalousHtml, /Unknown recorder/);
assert.match(anomalousHtml, />By Unknown</);

console.log(
  'Validated ManualApprovalPanel renders successfully (real executed render, not static regex) both when recorder/actorUser relations are present and when they are genuinely null -- reproducing and closing the exact client-side crash ("This approval could not be displayed") that occurred when an approval\'s manual-detail relations did not resolve as the schema\'s required-relation type otherwise promises.',
);
