import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertManualVerificationTransition,
  canManageManualApprovals,
  evidenceMatchScore,
  ManualApprovalTransitionError,
  manualApprovalInputSchema,
} from '../services/manual-approvals';

const validInput = {
  kind: 'VERBAL',
  subject: 'Approve Vendor Alpha onboarding',
  outcome: 'APPROVED',
  approvalType: 'EXPLICIT',
  approverName: 'Ravi Sharma',
  approverEmail: 'ravi@example.com',
  approverRole: 'Chief Financial Officer',
  approvalTimestamp: '2026-07-20T09:00:00.000Z',
  communicationChannel: 'Phone call',
  location: 'Mumbai',
  businessContext: 'Approval followed the quarterly vendor and budget review.',
  conditions: 'Legal must confirm the final contract language.',
  department: 'Finance',
  category: 'Vendor Approval',
  relatedEntityType: 'Vendor',
  relatedEntityId: 'vendor-alpha',
  supportingNotes: 'Recorded immediately after the call.',
  verificationStatus: 'PENDING_CONFIRMATION',
  confidenceLevel: 65,
  secondPersonRequired: true,
  changeReason: 'Initial verbal approval record.',
} as const;

test('manual approval input requires defensible recorder context', () => {
  const parsed = manualApprovalInputSchema.parse(validInput);
  assert.equal(parsed.kind, 'VERBAL');
  assert.equal(parsed.approvalTimestamp.toISOString(), '2026-07-20T09:00:00.000Z');

  const invalid = manualApprovalInputSchema.safeParse({
    ...validInput,
    businessContext: '',
    changeReason: '',
  });
  assert.equal(invalid.success, false);
});

test('only authorized workspace roles can manage manual approvals', () => {
  assert.equal(canManageManualApprovals('ADMIN'), true);
  assert.equal(canManageManualApprovals('MANAGER'), true);
  assert.equal(canManageManualApprovals('COMPLIANCE_OFFICER'), true);
  assert.equal(canManageManualApprovals('EMPLOYEE'), false);
  assert.equal(canManageManualApprovals('VIEWER'), false);
});

test('approver confirmation cannot be asserted by a normal manual edit', () => {
  assert.throws(
    () => assertManualVerificationTransition(null, 'CONFIRMED_BY_APPROVER'),
    ManualApprovalTransitionError,
  );
  assert.throws(
    () => assertManualVerificationTransition('PENDING_CONFIRMATION', 'CONFIRMED_BY_APPROVER'),
    /secure approver confirmation workflow/,
  );
  assert.doesNotThrow(() => assertManualVerificationTransition('CONFIRMED_BY_APPROVER', 'CONFIRMED_BY_APPROVER'));
  assert.doesNotThrow(() => assertManualVerificationTransition('PENDING_CONFIRMATION', 'DISPUTED'));
});

test('evidence correlation rewards shared context and time proximity', () => {
  const approvalTimestamp = new Date('2026-07-20T09:00:00.000Z');
  const strong = evidenceMatchScore({
    approvalText: 'Vendor Alpha $50000 finance contract onboarding',
    evidenceText: 'Finance confirmed the Vendor Alpha contract for $50000 onboarding.',
    approvalTimestamp,
    evidenceTimestamp: new Date('2026-07-20T10:00:00.000Z'),
  });
  const weak = evidenceMatchScore({
    approvalText: 'Vendor Alpha $50000 finance contract onboarding',
    evidenceText: 'Engineering discussed an unrelated deployment incident.',
    approvalTimestamp,
    evidenceTimestamp: new Date('2026-08-25T10:00:00.000Z'),
  });

  assert.ok(strong.score >= 70);
  assert.ok(strong.reasons.some((reason) => reason.startsWith('Matching term:')));
  assert.ok(strong.score > weak.score);
  assert.equal(weak.score, 0);
});
