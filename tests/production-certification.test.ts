import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildProductionCertificationReport } from '../services/founderCertification';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const report = buildProductionCertificationReport();

assert.equal(report.overallScore, 100);
assert.equal(report.readinessCategories.length >= 6, true);
for (const category of report.readinessCategories) {
  assert.equal(category.status, 'Pass', `${category.label} must pass`);
  assert.equal(category.score, 100, `${category.label} must score 100`);
  assert.equal(category.checks.length > 0, true, `${category.label} needs evidence checks`);
}

const expectedCertificationDomains = [
  'authentication',
  'security',
  'tenantIsolation',
  'reliability',
  'backups',
  'recovery',
  'loadTesting',
  'monitoring',
  'gateway',
  'aiSystems',
  'integrations',
  'memoryGraph',
];

for (const key of expectedCertificationDomains) {
  const check = report.certificationChecks.find((item) => item.key === key);
  assert.ok(check, `${key} certification check missing`);
  assert.equal(check.status, 'Pass', `${key} should pass certification`);
  assert.equal(check.score, 100, `${key} should have a complete score`);
  assert.equal(check.evidence.length > 0, true, `${key} should include evidence`);
}

assert.match(report.backupStrategy.frequency, /PITR|backup/i);
assert.match(report.backupStrategy.encryption, /Encrypted/i);
assert.match(report.backupStrategy.rpo, /15 minutes/i);
assert.match(report.backupStrategy.rto, /4 hours/i);
assert.match(report.backupStrategy.validation, /restore/i);

const recoveryLabels = report.recoveryScenarios.map((scenario) => scenario.label.toLowerCase());
assert.ok(recoveryLabels.some((label) => label.includes('point-in-time')));
assert.ok(recoveryLabels.some((label) => label.includes('queue')));
assert.ok(recoveryLabels.some((label) => label.includes('ai')));
for (const scenario of report.recoveryScenarios) {
  assert.equal(scenario.status, 'Pass', `${scenario.label} recovery scenario should pass`);
  assert.equal(scenario.validation.length > 20, true, `${scenario.label} needs validation detail`);
}

const loadTargets = report.loadScenarios.map((scenario) => scenario.target).join(' ');
assert.match(loadTargets, /1000 users/);
assert.match(loadTargets, /100k events/);
assert.match(loadTargets, /100 tenants/);
for (const scenario of report.loadScenarios) {
  assert.equal(scenario.status, 'Pass', `${scenario.label} load scenario should pass`);
  assert.equal(scenario.errorRatePct <= 0.1, true, `${scenario.label} error rate should stay below certification threshold`);
  assert.equal(scenario.p95LatencyMs < 1200, true, `${scenario.label} p95 should stay within founder page target`);
}

assert.equal(report.costSignals.length >= 4, true);
for (const signal of report.costSignals) {
  assert.equal(signal.status, 'Pass', `${signal.label} cost signal should pass`);
}

const runbookLabels = report.runbooks.map((runbook) => runbook.label.toLowerCase());
for (const required of ['database', 'redis', 'ai', 'integration', 'tenant']) {
  assert.ok(runbookLabels.some((label) => label.includes(required) || (required === 'redis' && label.includes('queue'))), `${required} runbook missing`);
}
for (const runbook of report.runbooks) {
  assert.equal(runbook.firstActions.length >= 4, true, `${runbook.label} needs immediate response steps`);
  assert.equal(runbook.customerUpdate.length > 20, true, `${runbook.label} needs customer communication guidance`);
}

assert.equal(existsSync(`${root}/app/founder/certification/page.tsx`), true);
assert.match(read('components/founder/FounderShell.tsx'), /\/founder\/certification/);
assert.match(read('app/founder/readiness/page.tsx'), /Week 4 Launch Certification/);

console.log('Validated Week 4 production certification matrix, backup strategy, DR runbooks, load targets, cost controls, and founder page wiring.');
