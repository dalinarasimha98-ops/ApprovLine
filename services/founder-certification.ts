/**
 * Founder Certification (/founder/certification) — a read-only rollup of
 * ApprovLine's real, already-computed control statuses into one
 * "go-live checklist" view. Introduces no new scoring engine, no new
 * health-checking logic, and no numeric "certification score."
 *
 * ARCHITECTURE AUDIT — why this file exists and what it replaces:
 *
 *   - services/founderCertification.ts's buildProductionCertificationReport()
 *     (previously used by THIS page and by /founder/readiness) was read in
 *     full and found to be entirely static/fabricated: every one of its 6
 *     readiness categories and 12 certification checks is hardcoded to
 *     `score: 100` / `status: 'Pass'` unconditionally, regardless of any
 *     real system state; its load-test scenarios carry invented
 *     `p95LatencyMs`/`errorRatePct` numbers with no load-testing harness or
 *     historical run anywhere in this codebase to back them; its backup
 *     strategy's RPO/RTO figures are policy targets with no automated
 *     restore-drill evidence. Presenting any of this as a live "Certified"
 *     result would be exactly the fabrication this rebuild is required to
 *     eliminate. That function is no longer called by any page — this file
 *     is the only certification engine now. (tests/founder-certification.ts
 *     supersedes the old tests/production-certification.test.ts, which
 *     asserted on the fabricated values above.)
 *   - Every LIVE_CHECK control below is a direct read of an existing,
 *     already-authoritative builder's own current-request output — never a
 *     second, competing computation of the same fact:
 *       - Security & Access        -> services/founder-security.ts's
 *         buildFounderSecurityPosture() controls, reused verbatim (same
 *         statuses, evidence, and sources Founder Security itself shows).
 *       - Tenant Isolation         -> services/founder.ts's
 *         buildFounderTenantIsolationReport(), which runs real Prisma
 *         COUNT queries to confirm organizationId coverage.
 *       - Reliability & Queue      -> services/founder-background-jobs.ts's
 *         buildFounderBackgroundJobs() (queueHealth, worker activity).
 *       - System Infrastructure    -> services/founder-system-health.ts's
 *         buildFounderSystemHealth() cards (a real `SELECT 1` / Redis PING
 *         each render, via services/readiness.ts).
 *       - Integrations             -> services/founder-integration-health.ts's
 *         buildIntegrationHealthPortfolio().
 *       - Observability            -> services/founder-observability.ts's
 *         buildFounderObservability(), including its own already-audited
 *         zero-vs-unavailable availability flags.
 *       - AI Systems               -> services/readiness.ts's
 *         buildReadinessReport() env-configuration checks for
 *         ANTHROPIC_API_KEY/OPENAI_API_KEY — configuration presence only,
 *         never a claim about live classification accuracy or latency.
 *   - Backup & Disaster Recovery and Load & Performance have NO automated,
 *     live-checked equivalent anywhere in this codebase (no restore-drill
 *     tracker, no load-testing harness/historical run). Rather than
 *     inventing a Pass, these two categories are always NOT_ASSESSED,
 *     evidenceType DOCUMENTED_POLICY — the target/policy text is shown
 *     honestly as documentation, never as a measured result.
 *   - The overall "certification decision" at the top of the page is a
 *     plain worst-of rollup over LIVE_CHECK controls only (see
 *     CertificationDecision below) — never an average, never a percentage,
 *     and never allows a documentation-only control to manufacture a false
 *     "verified" reading or to sink an otherwise-clean live result.
 */
import { buildFounderSecurityPosture } from '@/services/founder-security';
import { buildFounderSystemHealth } from '@/services/founder-system-health';
import { buildIntegrationHealthPortfolio } from '@/services/founder-integration-health';
import { buildFounderBackgroundJobs } from '@/services/founder-background-jobs';
import { buildFounderObservability } from '@/services/founder-observability';
import { buildFounderTenantIsolationReport } from '@/services/founder';
import { buildReadinessReport } from '@/services/readiness';
import {
  worstCertificationStatus,
  type CertificationControl,
  type CertificationStatus,
} from '@/lib/founder-certification';

export type CertificationDecision = 'ALL_VERIFIED' | 'NEEDS_ATTENTION' | 'HAS_FAILURES' | 'INSUFFICIENT_DATA';

export type CertificationKpis = {
  totalControls: number;
  verified: number;
  attention: number;
  notVerified: number;
  failed: number;
  notAssessed: number;
};

export type CertificationReport = {
  generatedAt: Date;
  decision: CertificationDecision;
  kpis: CertificationKpis;
  controls: CertificationControl[];
  attentionControls: CertificationControl[];
};

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function decisionFor(controls: CertificationControl[]): CertificationDecision {
  const liveStatuses = controls.filter((c) => c.evidenceType === 'LIVE_CHECK').map((c) => c.status);
  if (liveStatuses.length === 0) return 'INSUFFICIENT_DATA';
  const worst = worstCertificationStatus(liveStatuses);
  if (worst === 'FAILED') return 'HAS_FAILURES';
  if (worst === 'ATTENTION' || worst === 'NOT_VERIFIED') return 'NEEDS_ATTENTION';
  return 'ALL_VERIFIED';
}

export async function buildFounderCertificationCenter(): Promise<CertificationReport> {
  const generatedAt = new Date();

  const [securityReport, systemHealth, integrationHealthResult, backgroundJobs, observability, tenantIsolation, readiness] = await Promise.all([
    buildFounderSecurityPosture(),
    buildFounderSystemHealth(),
    buildIntegrationHealthPortfolio(),
    buildFounderBackgroundJobs(),
    buildFounderObservability(),
    buildFounderTenantIsolationReport(),
    buildReadinessReport(),
  ]);

  const controls: CertificationControl[] = [];

  // ── Security & Access — reused verbatim from Founder Security ─────────
  if (securityReport.ok) {
    for (const c of securityReport.controls) {
      controls.push({
        key: `security-${c.key}`,
        title: c.title,
        category: 'SECURITY_ACCESS',
        status: c.status,
        evidenceType: 'LIVE_CHECK',
        summary: c.summary,
        whyThisStatus: c.whyThisStatus,
        evidence: c.evidence,
        sources: c.sources,
        lastVerifiedAt: securityReport.generatedAt.toISOString(),
        requiredAction: c.nextAction,
      });
    }
  } else {
    controls.push({
      key: 'security-unavailable',
      title: 'Security Posture',
      category: 'SECURITY_ACCESS',
      status: 'FAILED',
      evidenceType: 'LIVE_CHECK',
      summary: 'The Founder Security posture check could not run.',
      whyThisStatus: 'buildFounderSecurityPosture() returned a safe error instead of a posture report — treated as a failed check, not silently skipped.',
      evidence: `Safe diagnostic: ${securityReport.safeError}`,
      sources: ['services/founder-security.ts'],
      lastVerifiedAt: null,
      requiredAction: 'Open /founder/security to see the underlying error and confirm database/environment configuration.',
    });
  }

  // ── Tenant Isolation — reused verbatim from buildFounderTenantIsolationReport ──
  for (const m of tenantIsolation.modules) {
    controls.push({
      key: `tenant-${slug(m.name)}`,
      title: m.name,
      category: 'TENANT_ISOLATION',
      status: m.status === 'Pass' ? 'VERIFIED' : 'ATTENTION',
      evidenceType: 'LIVE_CHECK',
      summary: m.detail,
      whyThisStatus: m.status === 'Pass'
        ? 'This module\'s real, current signal matches the expected tenant-isolation invariant.'
        : 'This module\'s real, current signal deviates from the expected tenant-isolation invariant and needs Founder review.',
      evidence: m.detail,
      sources: ['services/founder.ts:buildFounderTenantIsolationReport()', ...m.coverage],
      lastVerifiedAt: tenantIsolation.testedAt.toISOString(),
      requiredAction: m.status === 'Pass' ? null : 'Review the module detail above and re-run npm run test:tenant-isolation.',
    });
  }

  // ── Reliability & Queue — reused verbatim from Background Jobs ────────
  const queueStatus: CertificationStatus =
    backgroundJobs.queueHealth === 'HEALTHY' ? 'VERIFIED' :
    backgroundJobs.queueHealth === 'ATTENTION' ? 'ATTENTION' :
    backgroundJobs.queueHealth === 'CRITICAL' ? 'FAILED' : 'NOT_VERIFIED';
  controls.push({
    key: 'reliability-queue-health',
    title: 'Approval Queue Health',
    category: 'RELIABILITY_QUEUE',
    status: queueStatus,
    evidenceType: 'LIVE_CHECK',
    summary: backgroundJobs.queueHeadline,
    whyThisStatus: `queueHealth is derived live from ${backgroundJobs.queueName}'s current waiting/active/failed counts and dead-letter volume.`,
    evidence: backgroundJobs.queueHeadline,
    sources: ['services/founder-background-jobs.ts:buildFounderBackgroundJobs()'],
    lastVerifiedAt: backgroundJobs.generatedAt.toISOString(),
    requiredAction: queueStatus === 'VERIFIED' ? null : 'Open /founder/background-jobs to review failed and dead-lettered jobs.',
  });
  const workerStatus: CertificationStatus =
    backgroundJobs.worker.state === 'ONLINE' ? 'VERIFIED' :
    backgroundJobs.worker.state === 'STALE' ? 'ATTENTION' :
    backgroundJobs.worker.state === 'OFFLINE' ? 'FAILED' : 'NOT_VERIFIED';
  controls.push({
    key: 'reliability-worker-activity',
    title: 'Background Worker Activity',
    category: 'RELIABILITY_QUEUE',
    status: workerStatus,
    evidenceType: 'LIVE_CHECK',
    summary: backgroundJobs.worker.lastSeenAt
      ? `Worker last reported ${backgroundJobs.worker.lastSeenAt.toISOString()}.`
      : 'No worker heartbeat has ever been recorded.',
    whyThisStatus: 'Derived from the most recent WorkerHeartbeat row for this queue, compared against a 5 minute staleness threshold.',
    evidence: backgroundJobs.worker.lastSeenAt
      ? `Last seen: ${backgroundJobs.worker.lastSeenAt.toISOString()} (worker ${backgroundJobs.worker.workerId ?? 'unknown'})`
      : 'WorkerHeartbeat table has no row for this queue.',
    sources: ['services/founder-background-jobs.ts:buildFounderBackgroundJobs()', 'WorkerHeartbeat'],
    lastVerifiedAt: backgroundJobs.generatedAt.toISOString(),
    requiredAction: workerStatus === 'VERIFIED' ? null : 'Confirm the BullMQ worker process (npm run worker) is running and reporting heartbeats.',
  });

  // ── System Infrastructure — reused verbatim from System Health cards ──
  for (const key of ['application', 'database', 'redis'] as const) {
    const card = systemHealth.cards.find((c) => c.key === key);
    if (!card) continue;
    const status: CertificationStatus =
      card.status === 'HEALTHY' ? 'VERIFIED' :
      card.status === 'DEGRADED' ? 'ATTENTION' :
      card.status === 'FAILED' ? 'FAILED' : 'NOT_VERIFIED';
    controls.push({
      key: `infra-${card.key}`,
      title: card.label,
      category: 'SYSTEM_INFRASTRUCTURE',
      status,
      evidenceType: 'LIVE_CHECK',
      summary: card.headline,
      whyThisStatus: card.key === 'application'
        ? 'This page itself rendered under Founder authorization, confirming the application is serving requests.'
        : `A real connection check ran against ${card.label} for this request.`,
      evidence: card.detail,
      sources: ['services/founder-system-health.ts:buildFounderSystemHealth()', 'services/readiness.ts:buildReadinessReport()'],
      lastVerifiedAt: systemHealth.generatedAt.toISOString(),
      requiredAction: status === 'VERIFIED' ? null : 'Open /founder/system-health for the full diagnostic.',
    });
  }

  // ── Integrations — reused verbatim from Integration Health ────────────
  if (integrationHealthResult.safeError) {
    controls.push({
      key: 'integrations-unavailable',
      title: 'Integration Health',
      category: 'INTEGRATIONS',
      status: 'FAILED',
      evidenceType: 'LIVE_CHECK',
      summary: 'The Integration Health check could not run.',
      whyThisStatus: 'buildIntegrationHealthPortfolio() returned a safe error instead of portfolio data.',
      evidence: `Safe diagnostic: ${integrationHealthResult.safeError}`,
      sources: ['services/founder-integration-health.ts'],
      lastVerifiedAt: null,
      requiredAction: 'Open /founder/integration-health to see the underlying error.',
    });
  } else if (!integrationHealthResult.data.hasAnyIntegrationData) {
    controls.push({
      key: 'integrations-no-data',
      title: 'Integration Health',
      category: 'INTEGRATIONS',
      status: 'NOT_VERIFIED',
      evidenceType: 'LIVE_CHECK',
      summary: 'No customer integration connections are recorded yet.',
      whyThisStatus: 'There is no integration data to evaluate — not the same as a failure.',
      evidence: 'CustomerIntegrationStatus has zero rows.',
      sources: ['services/founder-integration-health.ts'],
      lastVerifiedAt: generatedAt.toISOString(),
      requiredAction: null,
    });
  } else {
    const { kpis } = integrationHealthResult.data;
    const status: CertificationStatus = kpis.critical > 0 ? 'FAILED' : kpis.attention > 0 ? 'ATTENTION' : 'VERIFIED';
    controls.push({
      key: 'integrations-health',
      title: 'Integration Health',
      category: 'INTEGRATIONS',
      status,
      evidenceType: 'LIVE_CHECK',
      summary: `${kpis.healthy} healthy, ${kpis.attention} attention, ${kpis.critical} critical of ${kpis.totalConnected} connected integrations.`,
      whyThisStatus: 'Derived live from CustomerIntegrationStatus rows across every customer.',
      evidence: `${kpis.affectedCustomers} customer(s) affected by a non-healthy integration.`,
      sources: ['services/founder-integration-health.ts:buildIntegrationHealthPortfolio()'],
      lastVerifiedAt: generatedAt.toISOString(),
      requiredAction: status === 'VERIFIED' ? null : 'Open /founder/integration-health to review affected customers.',
    });
  }

  // ── Observability — reused verbatim from Observability ────────────────
  const unavailableSignals = Object.entries(observability.availability).filter(([, ok]) => !ok).map(([k]) => k);
  const observabilityStatus: CertificationStatus =
    observability.platformStatus === 'FAILED' ? 'FAILED' :
    unavailableSignals.length > 0 || observability.attention.length > 0 ? 'ATTENTION' :
    observability.platformStatus === 'UNKNOWN' ? 'NOT_VERIFIED' : 'VERIFIED';
  controls.push({
    key: 'observability-signals',
    title: 'Founder Observability',
    category: 'OBSERVABILITY',
    status: observabilityStatus,
    evidenceType: 'LIVE_CHECK',
    summary: observability.attention.length === 0 && unavailableSignals.length === 0
      ? 'No open attention signals; all observability sources are available.'
      : `${observability.attention.length} attention signal(s); ${unavailableSignals.length} source(s) unavailable.`,
    whyThisStatus: 'Reuses /founder/observability\'s own already-audited attention signals and per-source availability flags.',
    evidence: unavailableSignals.length > 0 ? `Unavailable: ${unavailableSignals.join(', ')}.` : 'All observability sources responded.',
    sources: ['services/founder-observability.ts:buildFounderObservability()'],
    lastVerifiedAt: observability.generatedAt.toISOString(),
    requiredAction: observabilityStatus === 'VERIFIED' ? null : 'Open /founder/observability for the full attention list.',
  });

  // ── AI Systems — configuration presence only, never a performance claim ──
  const anthropicConfigured = readiness.checks.anthropic.status === 'ok';
  const openaiConfigured = readiness.checks.openai.status === 'ok';
  const aiStatus: CertificationStatus = anthropicConfigured ? 'VERIFIED' : openaiConfigured ? 'ATTENTION' : 'FAILED';
  controls.push({
    key: 'ai-provider-configuration',
    title: 'AI Provider Configuration',
    category: 'AI_SYSTEMS',
    status: aiStatus,
    evidenceType: 'LIVE_CHECK',
    summary: anthropicConfigured
      ? 'Anthropic (primary classifier) is configured.'
      : openaiConfigured
        ? 'Only the OpenAI fallback is configured; Anthropic (primary) is missing.'
        : 'Neither Anthropic nor OpenAI is configured — no classification provider is available.',
    whyThisStatus: 'This checks only whether a provider API key is present in the environment, never live classification accuracy, latency, or cost — no such measurement exists in this codebase.',
    evidence: `ANTHROPIC_API_KEY: ${readiness.checks.anthropic.message}. OPENAI_API_KEY: ${readiness.checks.openai.message}.`,
    sources: ['services/readiness.ts:buildReadinessReport()'],
    lastVerifiedAt: generatedAt.toISOString(),
    requiredAction: aiStatus === 'VERIFIED' ? null : 'Configure ANTHROPIC_API_KEY (primary) in the deployment environment.',
  });

  // ── Backup & Disaster Recovery — documented policy only, never measured ──
  controls.push({
    key: 'backup-recovery-policy',
    title: 'Backup & Point-in-Time Recovery Policy',
    category: 'DISASTER_RECOVERY',
    status: 'NOT_ASSESSED',
    evidenceType: 'DOCUMENTED_POLICY',
    summary: 'Continuous PITR plus daily logical backup verification is the documented policy for the production database.',
    whyThisStatus: 'No automated restore-drill tracker or scheduled recovery-rehearsal record exists anywhere in this codebase, so this cannot be shown as a live-verified result — only as the documented target.',
    evidence: 'Documented targets: RPO <= 15 minutes, RTO <= 4 hours for the customer dashboard, 7-day PITR window, 30-day logical backup archive, monthly restore rehearsal against a non-production database. These figures are managed-provider (Supabase/PostgreSQL) policy targets, not measured outcomes of an executed drill.',
    sources: ['docs/operations/*', 'README.md'],
    lastVerifiedAt: null,
    requiredAction: 'Record actual restore-drill dates/results (e.g. in docs/operations/) so this control can move to a live-checked status.',
  });
  controls.push({
    key: 'disaster-recovery-runbooks',
    title: 'Disaster Recovery Runbooks',
    category: 'DISASTER_RECOVERY',
    status: 'NOT_ASSESSED',
    evidenceType: 'DOCUMENTED_POLICY',
    summary: 'Documented runbooks exist for database, queue, AI provider, integration, and tenant-security incidents.',
    whyThisStatus: 'These are written response procedures, not automated checks — no incident-simulation harness exists to verify them live.',
    evidence: 'Covers: database degraded/unavailable, Redis/queue outage, AI provider outage, integration authorization failure, security/tenant-isolation alert — each with an owner, trigger, first actions, and a customer-communication template.',
    sources: ['docs/operations/*'],
    lastVerifiedAt: null,
    requiredAction: 'Schedule a tabletop exercise against each runbook and record the outcome.',
  });

  // ── Load & Performance — documented targets only, never measured ──────
  controls.push({
    key: 'load-performance-targets',
    title: 'Load & Scale Targets',
    category: 'LOAD_PERFORMANCE',
    status: 'NOT_ASSESSED',
    evidenceType: 'DOCUMENTED_POLICY',
    summary: 'Documented scale targets exist for concurrent users, approval ingestion, multitenant scale, and AI/integration/export workloads.',
    whyThisStatus: 'No load-testing harness or historical load-test run exists in this codebase, so no p95 latency or error-rate figure can be shown as measured — only the target itself.',
    evidence: 'Targets: 100/500/1000 concurrent users; 1k/10k/100k approval ingestion events; 10/50/100 tenants; AI, integration-sync, export, and Memory Graph workloads at pilot scale. No executed load test currently backs a pass/fail result for any of these.',
    sources: ['README.md'],
    lastVerifiedAt: null,
    requiredAction: 'Run an actual load test against a staging environment and record real p95 latency / error-rate results before claiming this control verified.',
  });

  const kpis: CertificationKpis = {
    totalControls: controls.length,
    verified: controls.filter((c) => c.status === 'VERIFIED').length,
    attention: controls.filter((c) => c.status === 'ATTENTION').length,
    notVerified: controls.filter((c) => c.status === 'NOT_VERIFIED').length,
    failed: controls.filter((c) => c.status === 'FAILED').length,
    notAssessed: controls.filter((c) => c.status === 'NOT_ASSESSED').length,
  };

  const attentionControls = controls.filter((c) => c.status === 'FAILED' || c.status === 'ATTENTION');

  return {
    generatedAt,
    decision: decisionFor(controls),
    kpis,
    controls,
    attentionControls,
  };
}
