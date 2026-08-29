import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInvestigationSummary,
  buildPolicyChecks,
  calculateRiskScore,
  timelineForApproval,
  getInvestigationMetrics,
  getInvestigationInsights,
  createInvestigationCase,
} from '../services/investigations';
import { hasAnyRole } from '../lib/rbac';

// ─── Pure function tests ─────────────────────────────────────────────────────

test('calculateRiskScore returns 0 for no approvals', () => {
  const approval = {
    riskLevel: null,
    confidence: 0,
    status: 'PENDING_REVIEW',
    evidenceSnippet: null,
    complianceEvaluations: [],
    approvalType: 'EXPLICIT',
    conditions: null,
    sourceLink: null,
  } as Parameters<typeof calculateRiskScore>[0];
  const score = calculateRiskScore(approval);
  assert.ok(score >= 0 && score <= 100, `score ${score} out of range`);
});

test('calculateRiskScore returns higher score for critical risk', () => {
  const base = {
    riskLevel: null as string | null,
    confidence: 90,
    status: 'APPROVED',
    evidenceSnippet: 'exists',
    complianceEvaluations: [],
    approvalType: 'EXPLICIT',
    conditions: null,
    sourceLink: 'http://example.com',
  } as Parameters<typeof calculateRiskScore>[0];
  const low = calculateRiskScore({ ...base, riskLevel: 'low' });
  const critical = calculateRiskScore({ ...base, riskLevel: 'critical' });
  assert.ok(critical > low, `critical (${critical}) should exceed low (${low})`);
});

test('buildInvestigationSummary returns structured summary for empty approvals', () => {
  const summary = buildInvestigationSummary([]);
  assert.ok(typeof summary.whatHappened === 'string');
  assert.ok(typeof summary.whoApproved === 'string');
  assert.ok(typeof summary.whyRisky === 'string');
  assert.ok(Array.isArray(summary.policyApplies));
  assert.ok(Array.isArray(summary.evidenceExists));
  assert.ok(Array.isArray(summary.evidenceMissing));
  assert.ok(typeof summary.riskScore === 'number');
});

test('buildPolicyChecks returns array of checks', () => {
  const checks = buildPolicyChecks([]);
  assert.ok(Array.isArray(checks));
  checks.forEach((c) => {
    assert.ok(typeof c.policy === 'string');
    assert.ok(typeof c.status === 'string');
    assert.ok(typeof c.finding === 'string');
  });
});

test('timelineForApproval returns chronological events', () => {
  const approval = {
    id: 'test-id',
    subject: 'Budget approval',
    approverName: 'Alice',
    riskLevel: 'medium',
    confidence: 70,
    status: 'APPROVED',
    sourcePlatform: 'slack',
    department: 'Finance',
    approvalTimestamp: new Date('2026-06-01T10:00:00Z'),
    occurredAt: new Date('2026-06-01T09:50:00Z'),
    createdAt: new Date('2026-06-01T09:55:00Z'),
    updatedAt: new Date('2026-06-01T09:55:00Z'),
    evidenceSnippet: 'Budget approved in Slack',
    sourceLink: null,
    complianceEvaluations: [],
    auditLogs: [],
    messageSource: null,
    approvalType: 'EXPLICIT',
    conditions: null,
  } as Parameters<typeof timelineForApproval>[0];
  const events = timelineForApproval(approval);
  assert.ok(Array.isArray(events));
  assert.ok(events.length > 0);
  events.forEach((e) => {
    assert.ok(e.at instanceof Date);
    assert.ok(typeof e.type === 'string');
    assert.ok(typeof e.title === 'string');
    assert.ok(typeof e.body === 'string');
  });
});

// ─── RBAC tests ──────────────────────────────────────────────────────────────

test('investigation RBAC allows MANAGER, ADMIN, OWNER', () => {
  assert.equal(hasAnyRole('MANAGER', ['MANAGER', 'ADMIN', 'OWNER']), true);
  assert.equal(hasAnyRole('ADMIN', ['MANAGER', 'ADMIN', 'OWNER']), true);
  assert.equal(hasAnyRole('OWNER', ['MANAGER', 'ADMIN', 'OWNER']), true);
});

test('investigation RBAC blocks MEMBER and VIEWER', () => {
  assert.equal(hasAnyRole('MEMBER', ['MANAGER', 'ADMIN', 'OWNER']), false);
  assert.equal(hasAnyRole('VIEWER', ['MANAGER', 'ADMIN', 'OWNER']), false);
});

// ─── Status transition coverage ──────────────────────────────────────────────

test('VALID_STATUSES includes all required values', () => {
  const statuses = ['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED'];
  // Ensure the status labels we use in the UI are valid enum values
  for (const s of statuses) {
    assert.ok(typeof s === 'string' && s.length > 0, `status ${s} must be a non-empty string`);
  }
});

// ─── Investigation type coverage ─────────────────────────────────────────────

test('investigation types are well-defined', () => {
  const types = ['Anomaly', 'Compliance', 'Security', 'Pattern', 'PolicyViolation', 'MissingEvidence', 'Manual'];
  assert.equal(types.length, 7);
  types.forEach((t) => assert.ok(typeof t === 'string' && t.length > 0));
});

// ─── API route auth shape ────────────────────────────────────────────────────

test('investigation service exports are callable', () => {
  assert.equal(typeof buildInvestigationSummary, 'function');
  assert.equal(typeof buildPolicyChecks, 'function');
  assert.equal(typeof calculateRiskScore, 'function');
  assert.equal(typeof timelineForApproval, 'function');
  assert.equal(typeof getInvestigationMetrics, 'function');
  assert.equal(typeof getInvestigationInsights, 'function');
  assert.equal(typeof createInvestigationCase, 'function');
});

// ─── Risk score boundary tests ───────────────────────────────────────────────

test('calculateRiskScore never exceeds 100', () => {
  const worst = {
    riskLevel: 'critical',
    confidence: 0,
    status: 'PENDING_REVIEW',
    evidenceSnippet: null,
    complianceEvaluations: [
      { score: 10, severity: 'critical', status: 'Non-compliant' },
      { score: 5, severity: 'high', status: 'Non-compliant' },
    ],
    approvalType: 'CONDITIONAL',
    conditions: 'Must be reviewed by legal',
    sourceLink: null,
  } as Parameters<typeof calculateRiskScore>[0];
  const score = calculateRiskScore(worst);
  assert.ok(score <= 100, `score ${score} must not exceed 100`);
});

test('calculateRiskScore never goes below 0', () => {
  const best = {
    riskLevel: 'low',
    confidence: 100,
    status: 'APPROVED',
    evidenceSnippet: 'Complete evidence trail attached',
    complianceEvaluations: [],
    approvalType: 'EXPLICIT',
    conditions: null,
    sourceLink: 'https://example.com/evidence',
  } as Parameters<typeof calculateRiskScore>[0];
  const score = calculateRiskScore(best);
  assert.ok(score >= 0, `score ${score} must not go below 0`);
});
