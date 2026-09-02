import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { tenantScopedWhere, assertTenantAccess } from '@/lib/tenant-isolation';
import { writeAuditLog } from '@/services/audit';

// ── Types ────────────────────────────────────────────────────────────────────

export type ComplianceScoreLabel = 'Excellent' | 'Good' | 'Needs Attention' | 'At Risk' | 'Critical';

export type FrameworkSummary = {
  id: string;
  slug: string;
  name: string;
  score: number | null;
  controls: number;
  openIssues: number;
  trend: 'up' | 'down' | 'stable' | null;
  lastAssessmentAt: string | null;
  isEnabled: boolean;
};

export type ControlSummary = {
  id: string;
  frameworkId: string;
  frameworkName: string;
  controlRef: string;
  name: string;
  description: string | null;
  category: string | null;
  owner: string | null;
  status: string;
  effectiveness: number | null;
  lastTestedAt: string | null;
  nextReviewAt: string | null;
  openIssues: number;
};

export type IssueSummary = {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  owner: string | null;
  dueDate: string | null;
  frameworkName: string | null;
  controlName: string | null;
  createdAt: string;
};

export type AttestationSummary = {
  id: string;
  title: string;
  policy: string | null;
  owner: string | null;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  controlName: string | null;
};

export type DeadlineSummary = {
  id: string;
  title: string;
  type: string;
  owner: string | null;
  dueDate: string;
  status: string;
  daysRemaining: number;
  frameworkName: string | null;
};

export type RecentActivity = {
  id: string;
  action: string;
  label: string;
  category: string;
  actorUserId: string | null;
  createdAt: string;
};

export type RiskArea = {
  name: string;
  riskLevel: string;
  openIssues: number;
  trend: 'up' | 'down' | 'stable';
};

export type HealthMetric = {
  label: string;
  value: number;
  total: number;
  delta: number | null;
};

export type ComplianceOverview = {
  score: number;
  scoreTrend: number | null;
  scoreLabel: ComplianceScoreLabel;
  frameworks: FrameworkSummary[];
  controlStats: {
    effective: number;
    partiallyEffective: number;
    ineffective: number;
    notAssessed: number;
    total: number;
  };
  openIssues: number;
  highPriorityIssues: number;
  upcomingAudits: number;
  evidenceCoverage: number;
  approvalCompliance: number;
  recentActivities: RecentActivity[];
  upcomingDeadlines: DeadlineSummary[];
  topRiskAreas: RiskArea[];
  healthMetrics: HealthMetric[];
  degraded: boolean;
};

export type ComplianceTrendPoint = {
  label: string;
  score: number;
};

export type ActionItem = {
  type: 'high_risk_approvals' | 'evidence_gaps' | 'policy_acknowledgements' | 'overdue_issues';
  title: string;
  subtitle: string;
  count: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  href: string;
  actionLabel: string;
};

export type WorkQueueItem = {
  id: string;
  type: 'approval' | 'control' | 'policy' | 'investigation' | 'attestation';
  title: string;
  subtitle?: string;
  owner?: string;
  priority: 'High' | 'Medium' | 'Low';
  dueLabel?: string;
  dueUrgent: boolean;
  status?: string;
  href: string;
  actionLabel: string;
};

export type PolicyDocStatus = {
  id: string;
  name: string;
  state: 'compliant' | 'review_required' | 'violations' | 'archived' | 'indexing';
  detail: string;
  href: string;
};

export type AIAdvisorInsight = {
  headline: string;
  whyItMatters: string;
  recommendedAction: string;
  evidenceHref: string;
  copilotQuery: string;
};

export type WorkspaceControlRow = {
  id: string;
  name: string;
  frameworkName?: string;
  owner?: string;
  status: string;
  lastTestedAt?: string;
  href: string;
};

export type ComplianceWorkspace = {
  actionItems: ActionItem[];
  workQueue: WorkQueueItem[];
  topControls: WorkspaceControlRow[];
  recentIssues: IssueSummary[];
  policyDocs: PolicyDocStatus[];
  aiAdvisor: AIAdvisorInsight | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreLabel(score: number): ComplianceScoreLabel {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Needs Attention';
  if (score >= 40) return 'At Risk';
  return 'Critical';
}

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

function isoStr(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** Map AuditLog.action → human-readable label + category */
function labelActivity(action: string): { label: string; category: string } {
  const map: Record<string, { label: string; category: string }> = {
    PLAYBOOK_UPLOADED: { label: 'Policy document uploaded', category: 'Policy' },
    PLAYBOOK_INDEXED: { label: 'Policy indexed', category: 'Policy' },
    PLAYBOOK_ARCHIVED: { label: 'Policy archived', category: 'Policy' },
    PLAYBOOK_QUERY: { label: 'Playbook AI queried', category: 'Policy' },
    PLAYBOOK_EVALUATED: { label: 'Compliance evaluation run', category: 'Assessment' },
    COMPLIANCE_ISSUE_CREATED: { label: 'Compliance issue opened', category: 'Issue' },
    COMPLIANCE_ISSUE_RESOLVED: { label: 'Compliance issue resolved', category: 'Issue' },
    COMPLIANCE_ATTESTATION_COMPLETED: { label: 'Attestation completed', category: 'Attestation' },
    COMPLIANCE_CONTROL_UPDATED: { label: 'Control status updated', category: 'Control' },
    INTEGRATION_CONNECTED: { label: 'Integration connected', category: 'Integration' },
    INTEGRATION_DISCONNECTED: { label: 'Integration disconnected', category: 'Integration' },
    INVESTIGATION_CREATED: { label: 'Investigation opened', category: 'Investigation' },
    INVESTIGATION_RESOLVED: { label: 'Investigation resolved', category: 'Investigation' },
    SECURITY_REQUEST: { label: 'Security request submitted', category: 'Security' },
  };
  const hit = map[action];
  if (hit) return hit;
  // Fallback: prettify action name
  const label = action.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  return { label, category: 'General' };
}

// ── Seed default frameworks + controls for a new tenant ───────────────────

const DEFAULT_FRAMEWORKS: Array<{
  slug: string;
  name: string;
  description: string;
  controls: Array<{ controlRef: string; name: string; category: string; description: string }>;
}> = [
  {
    slug: 'soc2',
    name: 'SOC 2 Type II',
    description: 'Service Organization Controls 2 — Trust Services Criteria for security, availability, processing integrity, confidentiality, and privacy.',
    controls: [
      { controlRef: 'CC1.1', name: 'Control Environment', category: 'Common Criteria', description: 'The entity demonstrates a commitment to integrity and ethical values.' },
      { controlRef: 'CC2.1', name: 'Communication & Information', category: 'Common Criteria', description: 'Information is obtained from and shared with relevant parties.' },
      { controlRef: 'CC6.1', name: 'Logical and Physical Access Controls', category: 'Access Control', description: 'Logical access security measures restrict access to information assets.' },
      { controlRef: 'CC6.2', name: 'Prior to Issuing System Credentials', category: 'Access Control', description: 'New internal and external users are registered and authorized before they access the system.' },
      { controlRef: 'CC7.1', name: 'Change Management', category: 'Change Management', description: 'Changes to infrastructure, data, software are managed.' },
      { controlRef: 'CC9.1', name: 'Vendor Management', category: 'Vendor Management', description: 'Vendor and business partner risks are identified, assessed, and managed.' },
      { controlRef: 'CC9.2', name: 'Business Partners & Suppliers', category: 'Vendor Management', description: 'The entity assesses the risk associated with vendors and suppliers.' },
      { controlRef: 'A1.1', name: 'Availability Monitoring', category: 'Availability', description: 'System components are monitored to detect capacity and performance issues.' },
    ],
  },
  {
    slug: 'iso27001',
    name: 'ISO 27001:2022',
    description: 'International standard for information security management systems (ISMS).',
    controls: [
      { controlRef: 'A.5.1', name: 'Policies for Information Security', category: 'Organizational', description: 'Information security policy is defined and communicated.' },
      { controlRef: 'A.6.1', name: 'Screening', category: 'People', description: 'Background verification checks are conducted for all candidates.' },
      { controlRef: 'A.8.1', name: 'User Endpoint Devices', category: 'Technological', description: 'Security of user endpoint devices is managed.' },
      { controlRef: 'A.8.5', name: 'Secure Authentication', category: 'Technological', description: 'Secure authentication technologies are implemented.' },
      { controlRef: 'A.8.15', name: 'Logging', category: 'Technological', description: 'Logs recording user activities and events are produced, stored, and protected.' },
      { controlRef: 'A.8.25', name: 'Secure Development Lifecycle', category: 'Technological', description: 'Information security requirements are specified in the development of software.' },
    ],
  },
  {
    slug: 'gdpr',
    name: 'GDPR',
    description: 'EU General Data Protection Regulation — controls for personal data processing, privacy rights, and breach notification.',
    controls: [
      { controlRef: 'Art.5', name: 'Principles of Processing', category: 'Data Processing', description: 'Personal data is processed lawfully, fairly, and transparently.' },
      { controlRef: 'Art.13', name: 'Information to Data Subjects', category: 'Transparency', description: 'Data subjects are informed about data processing at collection time.' },
      { controlRef: 'Art.25', name: 'Data Protection by Design', category: 'Privacy', description: 'Data protection measures are integrated into processing activities.' },
      { controlRef: 'Art.30', name: 'Records of Processing Activities', category: 'Documentation', description: 'Records of processing activities are maintained.' },
      { controlRef: 'Art.33', name: 'Breach Notification', category: 'Incident Response', description: 'Personal data breaches are notified to supervisory authorities within 72 hours.' },
    ],
  },
  {
    slug: 'hipaa',
    name: 'HIPAA',
    description: 'Health Insurance Portability and Accountability Act — safeguards for protected health information.',
    controls: [
      { controlRef: '164.308(a)(1)', name: 'Risk Analysis', category: 'Administrative', description: 'Conduct an accurate and thorough assessment of potential risks to ePHI.' },
      { controlRef: '164.308(a)(3)', name: 'Workforce Security', category: 'Administrative', description: 'Implement policies and procedures to ensure all workforce members have appropriate access.' },
      { controlRef: '164.310(a)(1)', name: 'Facility Access Controls', category: 'Physical', description: 'Implement policies and procedures to limit physical access to electronic information systems.' },
      { controlRef: '164.312(a)(1)', name: 'Access Control', category: 'Technical', description: 'Implement technical policies and procedures allowing only authorized persons access to ePHI.' },
    ],
  },
  {
    slug: 'pcidss',
    name: 'PCI DSS v4.0',
    description: 'Payment Card Industry Data Security Standard — controls for cardholder data environments.',
    controls: [
      { controlRef: 'Req.1', name: 'Network Security Controls', category: 'Network', description: 'Install and maintain network security controls.' },
      { controlRef: 'Req.3', name: 'Protect Account Data', category: 'Data Protection', description: 'Protect stored account data.' },
      { controlRef: 'Req.7', name: 'Restrict Access', category: 'Access Control', description: 'Restrict access to system components and cardholder data by business need to know.' },
      { controlRef: 'Req.10', name: 'Log and Monitor', category: 'Monitoring', description: 'Log and monitor all access to system components and cardholder data.' },
    ],
  },
  {
    slug: 'nist_csf',
    name: 'NIST CSF 2.0',
    description: 'NIST Cybersecurity Framework — identify, protect, detect, respond, recover.',
    controls: [
      { controlRef: 'GV.OC', name: 'Organizational Context', category: 'Govern', description: 'Organizational mission and stakeholder expectations inform cybersecurity risk strategy.' },
      { controlRef: 'ID.AM', name: 'Asset Management', category: 'Identify', description: 'Assets are identified and managed consistent with their importance to organizational objectives.' },
      { controlRef: 'PR.AA', name: 'Identity Management & Access Control', category: 'Protect', description: 'Access to assets is limited to authorized users and activities.' },
      { controlRef: 'DE.CM', name: 'Continuous Monitoring', category: 'Detect', description: 'Assets are monitored to find anomalies, indicators of compromise, and other events.' },
      { controlRef: 'RS.MA', name: 'Incident Management', category: 'Respond', description: 'Incidents are managed consistent with the response plan.' },
    ],
  },
];

export async function seedComplianceFrameworks(organizationId: string): Promise<void> {
  const existing = await prisma.complianceFramework.count({ where: { organizationId } });
  if (existing > 0) return;

  for (const fw of DEFAULT_FRAMEWORKS) {
    const framework = await prisma.complianceFramework.create({
      data: { organizationId, slug: fw.slug, name: fw.name, description: fw.description },
    });
    await prisma.complianceControl.createMany({
      data: fw.controls.map((c) => ({
        organizationId,
        frameworkId: framework.id,
        controlRef: c.controlRef,
        name: c.name,
        category: c.category,
        description: c.description,
        status: 'NOT_ASSESSED',
      })),
    });
  }
}

// ── Core data functions ───────────────────────────────────────────────────

/** Derive compliance score from ApprovalComplianceEvaluation.
 *  Falls back to approximation from approval risk levels if no evaluations exist. */
async function deriveComplianceScore(organizationId: string): Promise<{ score: number; trend: number | null }> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86_400_000);

  const [currentEvals, previousEvals] = await Promise.all([
    prisma.approvalComplianceEvaluation.findMany({
      where: { organizationId, createdAt: { gte: thirtyDaysAgo } },
      select: { score: true },
    }),
    prisma.approvalComplianceEvaluation.findMany({
      where: { organizationId, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      select: { score: true },
    }),
  ]);

  let currentScore: number;
  let previousScore: number | null = null;

  if (currentEvals.length > 0) {
    currentScore = Math.round(currentEvals.reduce((s, e) => s + e.score, 0) / currentEvals.length);
    if (previousEvals.length > 0) {
      previousScore = Math.round(previousEvals.reduce((s, e) => s + e.score, 0) / previousEvals.length);
    }
  } else {
    // Approximate from approval risk levels
    const approvals = await prisma.approvalRecord.findMany({
      where: { organizationId, createdAt: { gte: thirtyDaysAgo } },
      select: { riskLevel: true, status: true, evidenceSnippet: true },
      take: 200,
    });
    if (approvals.length === 0) return { score: 0, trend: null };
    let total = 0;
    for (const a of approvals) {
      let s = 75;
      if (a.riskLevel === 'high') s -= 20;
      else if (a.riskLevel === 'critical') s -= 35;
      if (a.status === 'PENDING_REVIEW') s -= 10;
      if (!a.evidenceSnippet) s -= 10;
      total += Math.max(0, s);
    }
    currentScore = Math.round(total / approvals.length);
  }

  const trend = previousScore !== null ? currentScore - previousScore : null;
  return { score: currentScore, trend };
}

/** Compliance score trend: average score per day/week bucket */
async function buildScoreTrend(organizationId: string, days: number): Promise<ComplianceTrendPoint[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const evals = await prisma.approvalComplianceEvaluation.findMany({
    where: { organizationId, createdAt: { gte: cutoff } },
    select: { score: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  if (evals.length === 0) return [];

  const bucketSize = days <= 7 ? 1 : days <= 30 ? 1 : 7;
  const buckets = new Map<string, number[]>();

  for (const e of evals) {
    const d = new Date(e.createdAt);
    if (bucketSize === 1) {
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(e.score);
    } else {
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(e.score);
    }
  }

  return Array.from(buckets.entries()).map(([label, scores]) => ({
    label,
    score: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
  }));
}

/** Evidence coverage: approver, timestamp, source, evidence snippet present ratios */
async function deriveEvidenceCoverage(organizationId: string): Promise<number> {
  const [total, withApprover, withEvidence] = await Promise.all([
    prisma.approvalRecord.count({ where: { organizationId } }),
    prisma.approvalRecord.count({ where: { organizationId, approverName: { not: null } } }),
    prisma.approvalRecord.count({ where: { organizationId, evidenceSnippet: { not: null } } }),
  ]);
  if (total === 0) return 0;
  return Math.round(((withApprover + withEvidence) / (total * 2)) * 100);
}

/** Top risk areas derived from ApprovalRecord.category + riskLevel + InvestigationCase */
async function deriveRiskAreas(organizationId: string): Promise<RiskArea[]> {
  const [highRisk, investigations] = await Promise.all([
    prisma.approvalRecord.groupBy({
      by: ['category'],
      where: { organizationId, riskLevel: { in: ['high', 'critical'] } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),
    prisma.investigationCase.findMany({
      where: { organizationId, status: { in: ['OPEN', 'IN_PROGRESS', 'ESCALATED'] } },
      select: { type: true, department: true, riskLevel: true },
    }),
  ]);

  const riskMap = new Map<string, { count: number; level: string }>();
  for (const r of highRisk) {
    const name = r.category ?? 'General';
    riskMap.set(name, { count: r._count.id, level: 'High' });
  }
  for (const inv of investigations) {
    const name = inv.department ?? inv.type ?? 'General';
    const existing = riskMap.get(name);
    if (existing) {
      existing.count += 1;
      if (inv.riskLevel === 'critical') existing.level = 'Critical';
    } else {
      riskMap.set(name, { count: 1, level: inv.riskLevel === 'critical' ? 'Critical' : 'High' });
    }
  }

  return Array.from(riskMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([name, { count, level }]) => ({
      name,
      riskLevel: level,
      openIssues: count,
      trend: 'stable' as const,
    }));
}

// ── Main service functions ────────────────────────────────────────────────

export const getComplianceOverview = cache(
  unstable_cache(
    async (organizationId: string): Promise<ComplianceOverview> => {
      const scope = { organizationId };
      try {
        const [
          { score, trend: scoreTrend },
          frameworks,
          controls,
          issues,
          upcomingDeadlines,
          auditLogs,
          evidenceCoverage,
          riskAreas,
          attestations,
          totalApprovals,
          compliantApprovals,
        ] = await withTimeout(
          'compliance-overview',
          Promise.all([
            deriveComplianceScore(organizationId),
            prisma.complianceFramework.findMany({
              where: tenantScopedWhere(scope),
              include: {
                controls: { select: { status: true } },
                issues: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } },
              },
              orderBy: { name: 'asc' },
            }),
            prisma.complianceControl.findMany({
              where: tenantScopedWhere(scope),
              select: { status: true },
            }),
            prisma.complianceIssue.findMany({
              where: tenantScopedWhere(scope, { status: { in: ['OPEN', 'IN_PROGRESS'] } }),
              select: { severity: true },
            }),
            prisma.complianceDeadline.findMany({
              where: tenantScopedWhere(scope, { status: { in: ['UPCOMING', 'IN_PROGRESS'] }, dueDate: { gte: new Date() } }),
              include: { framework: { select: { name: true } } },
              orderBy: { dueDate: 'asc' },
              take: 6,
            }),
            prisma.auditLog.findMany({
              where: tenantScopedWhere(scope),
              select: { id: true, action: true, actorUserId: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 10,
            }),
            deriveEvidenceCoverage(organizationId),
            deriveRiskAreas(organizationId),
            prisma.complianceAttestation.findMany({
              where: tenantScopedWhere(scope, { status: 'PENDING' }),
              select: { id: true },
            }),
            prisma.approvalRecord.count({ where: tenantScopedWhere(scope) }),
            prisma.approvalComplianceEvaluation.count({
              where: tenantScopedWhere(scope, { status: 'Compliant' }),
            }),
          ]),
          8000,
        );

        // Framework summaries
        const frameworkSummaries: FrameworkSummary[] = frameworks.map((fw) => {
          const controlCount = fw.controls.length;
          const assessed = fw.controls.filter((c) => c.status !== 'NOT_ASSESSED').length;
          const effective = fw.controls.filter((c) => c.status === 'EFFECTIVE').length;
          const fwScore = assessed === 0 ? null : Math.round((effective / controlCount) * 100);
          return {
            id: fw.id,
            slug: fw.slug,
            name: fw.name,
            score: fwScore,
            controls: controlCount,
            openIssues: fw.issues.length,
            trend: null,
            lastAssessmentAt: isoStr(fw.lastAssessmentAt),
            isEnabled: fw.isEnabled,
          };
        });

        // Control status distribution
        const controlStats = {
          effective: controls.filter((c) => c.status === 'EFFECTIVE').length,
          partiallyEffective: controls.filter((c) => c.status === 'PARTIALLY_EFFECTIVE').length,
          ineffective: controls.filter((c) => c.status === 'INEFFECTIVE').length,
          notAssessed: controls.filter((c) => c.status === 'NOT_ASSESSED').length,
          total: controls.length,
        };

        // Issue counts
        const openIssues = issues.length;
        const highPriorityIssues = issues.filter((i) => i.severity === 'HIGH' || i.severity === 'CRITICAL').length;

        // Upcoming audits (deadlines of type AUDIT)
        const upcomingAudits = await prisma.complianceDeadline.count({
          where: tenantScopedWhere(scope, { type: 'AUDIT', status: { in: ['UPCOMING', 'IN_PROGRESS'] }, dueDate: { gte: new Date() } }),
        });

        // Approval compliance %
        const approvalCompliance = totalApprovals > 0 ? Math.round((compliantApprovals / totalApprovals) * 100) : 0;

        // Recent activities
        const recentActivities: RecentActivity[] = auditLogs.map((log) => {
          const { label, category } = labelActivity(log.action);
          return {
            id: log.id,
            action: log.action,
            label,
            category,
            actorUserId: log.actorUserId,
            createdAt: log.createdAt.toISOString(),
          };
        });

        // Upcoming deadlines
        const deadlines: DeadlineSummary[] = upcomingDeadlines.map((d) => ({
          id: d.id,
          title: d.title,
          type: d.type,
          owner: d.owner,
          dueDate: d.dueDate.toISOString(),
          status: d.status,
          daysRemaining: daysUntil(d.dueDate),
          frameworkName: d.framework?.name ?? null,
        }));

        // Health metrics
        const healthMetrics: HealthMetric[] = [
          { label: 'Policies', value: await prisma.playbookDocument.count({ where: tenantScopedWhere(scope, { status: 'READY' }) }), total: await prisma.playbookDocument.count({ where: tenantScopedWhere(scope) }), delta: null },
          { label: 'Controls', value: controlStats.effective, total: controlStats.total, delta: null },
          { label: 'Assessments', value: await prisma.approvalComplianceEvaluation.count({ where: tenantScopedWhere(scope) }), total: totalApprovals, delta: null },
          { label: 'Open Issues', value: openIssues, total: openIssues + await prisma.complianceIssue.count({ where: tenantScopedWhere(scope, { status: { in: ['RESOLVED', 'ACCEPTED'] } }) }), delta: null },
          { label: 'Attestations', value: attestations.length, total: await prisma.complianceAttestation.count({ where: tenantScopedWhere(scope) }), delta: null },
        ];

        return {
          score,
          scoreTrend,
          scoreLabel: scoreLabel(score),
          frameworks: frameworkSummaries,
          controlStats,
          openIssues,
          highPriorityIssues,
          upcomingAudits,
          evidenceCoverage,
          approvalCompliance,
          recentActivities,
          upcomingDeadlines: deadlines,
          topRiskAreas: riskAreas,
          healthMetrics,
          degraded: false,
        };
      } catch (err) {
        console.error('[compliance-overview] fetch error', err);
        return {
          score: 0,
          scoreTrend: null,
          scoreLabel: 'Critical',
          frameworks: [],
          controlStats: { effective: 0, partiallyEffective: 0, ineffective: 0, notAssessed: 0, total: 0 },
          openIssues: 0,
          highPriorityIssues: 0,
          upcomingAudits: 0,
          evidenceCoverage: 0,
          approvalCompliance: 0,
          recentActivities: [],
          upcomingDeadlines: [],
          topRiskAreas: [],
          healthMetrics: [],
          degraded: true,
        };
      }
    },
    ['compliance-overview'],
    { revalidate: 120 },
  ),
);

export const getComplianceFrameworks = cache(
  unstable_cache(
    async (organizationId: string): Promise<FrameworkSummary[]> => {
      const scope = { organizationId };
      const frameworks = await withTimeout(
        'compliance-frameworks',
        prisma.complianceFramework.findMany({
          where: tenantScopedWhere(scope),
          include: {
            controls: { select: { status: true, effectiveness: true } },
            issues: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { severity: true } },
          },
          orderBy: { name: 'asc' },
        }),
        4000,
      );

      return frameworks.map((fw) => {
        const totalControls = fw.controls.length;
        const assessed = fw.controls.filter((c) => c.status !== 'NOT_ASSESSED').length;
        const effective = fw.controls.filter((c) => c.status === 'EFFECTIVE').length;
        const fwScore = assessed === 0 ? null : Math.round((effective / Math.max(totalControls, 1)) * 100);
        return {
          id: fw.id,
          slug: fw.slug,
          name: fw.name,
          score: fwScore,
          controls: totalControls,
          openIssues: fw.issues.length,
          trend: null,
          lastAssessmentAt: isoStr(fw.lastAssessmentAt),
          isEnabled: fw.isEnabled,
        };
      });
    },
    ['compliance-frameworks'],
    { revalidate: 120 },
  ),
);

export const getComplianceControls = cache(
  unstable_cache(
    async (organizationId: string, frameworkId?: string): Promise<ControlSummary[]> => {
      const scope = { organizationId };
      const where = frameworkId
        ? tenantScopedWhere(scope, { frameworkId })
        : tenantScopedWhere(scope);

      const controls = await withTimeout(
        'compliance-controls',
        prisma.complianceControl.findMany({
          where,
          include: {
            framework: { select: { name: true } },
            issues: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } },
          },
          orderBy: [{ framework: { name: 'asc' } }, { controlRef: 'asc' }],
          take: 200,
        }),
        4000,
      );

      return controls.map((c) => ({
        id: c.id,
        frameworkId: c.frameworkId,
        frameworkName: c.framework.name,
        controlRef: c.controlRef,
        name: c.name,
        description: c.description,
        category: c.category,
        owner: c.owner,
        status: c.status,
        effectiveness: c.effectiveness,
        lastTestedAt: isoStr(c.lastTestedAt),
        nextReviewAt: isoStr(c.nextReviewAt),
        openIssues: c.issues.length,
      }));
    },
    ['compliance-controls'],
    { revalidate: 120 },
  ),
);

export async function getComplianceIssues(
  organizationId: string,
  filters?: { status?: string; severity?: string; frameworkId?: string },
): Promise<IssueSummary[]> {
  const scope = { organizationId };
  const where: Record<string, unknown> = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.severity) where.severity = filters.severity;
  if (filters?.frameworkId) where.frameworkId = filters.frameworkId;

  const issues = await prisma.complianceIssue.findMany({
    where: tenantScopedWhere(scope, where),
    include: {
      framework: { select: { name: true } },
      control: { select: { name: true } },
    },
    orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });

  return issues.map((i) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    severity: i.severity,
    status: i.status,
    owner: i.owner,
    dueDate: isoStr(i.dueDate),
    frameworkName: i.framework?.name ?? null,
    controlName: i.control?.name ?? null,
    createdAt: i.createdAt.toISOString(),
  }));
}

export async function getComplianceAttestations(organizationId: string): Promise<AttestationSummary[]> {
  const scope = { organizationId };
  const attestations = await prisma.complianceAttestation.findMany({
    where: tenantScopedWhere(scope),
    include: { control: { select: { name: true } } },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    take: 100,
  });

  return attestations.map((a) => ({
    id: a.id,
    title: a.title,
    policy: a.policy,
    owner: a.owner,
    status: a.status,
    dueDate: isoStr(a.dueDate),
    completedAt: isoStr(a.completedAt),
    controlName: a.control?.name ?? null,
  }));
}

export async function getComplianceTrend(organizationId: string, days: number): Promise<ComplianceTrendPoint[]> {
  return buildScoreTrend(organizationId, days);
}

// ── Mutation functions ────────────────────────────────────────────────────

type TenantContext = { organizationId: string; userId?: string };

export async function createComplianceIssue(
  ctx: TenantContext,
  input: {
    title: string;
    description?: string;
    severity: string;
    frameworkId?: string;
    controlId?: string;
    owner?: string;
    dueDate?: Date;
    approvalRecordId?: string;
  },
): Promise<IssueSummary> {
  const issue = await prisma.complianceIssue.create({
    data: {
      organizationId: ctx.organizationId,
      ...input,
      status: 'OPEN',
    },
    include: {
      framework: { select: { name: true } },
      control: { select: { name: true } },
    },
  });

  await writeAuditLog({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'COMPLIANCE_ISSUE_CREATED',
    metadata: { issueId: issue.id, title: issue.title, severity: issue.severity },
  });

  return {
    id: issue.id,
    title: issue.title,
    description: issue.description,
    severity: issue.severity,
    status: issue.status,
    owner: issue.owner,
    dueDate: isoStr(issue.dueDate),
    frameworkName: issue.framework?.name ?? null,
    controlName: issue.control?.name ?? null,
    createdAt: issue.createdAt.toISOString(),
  };
}

export async function updateComplianceIssueStatus(
  ctx: TenantContext,
  issueId: string,
  status: string,
): Promise<void> {
  const issue = await prisma.complianceIssue.findUnique({ where: { id: issueId } });
  if (!issue) throw new Error('Issue not found');
  assertTenantAccess({ organizationId: ctx.organizationId }, issue, 'ComplianceIssue');

  await prisma.complianceIssue.update({
    where: { id: issueId },
    data: { status, resolvedAt: status === 'RESOLVED' ? new Date() : undefined },
  });

  await writeAuditLog({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'COMPLIANCE_ISSUE_RESOLVED',
    metadata: { issueId, status },
  });
}

export async function completeAttestation(
  ctx: TenantContext,
  attestationId: string,
  notes?: string,
): Promise<void> {
  const att = await prisma.complianceAttestation.findUnique({ where: { id: attestationId } });
  if (!att) throw new Error('Attestation not found');
  assertTenantAccess({ organizationId: ctx.organizationId }, att, 'ComplianceAttestation');

  await prisma.complianceAttestation.update({
    where: { id: attestationId },
    data: { status: 'COMPLETED', completedAt: new Date(), completedByUserId: ctx.userId, notes },
  });

  await writeAuditLog({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'COMPLIANCE_ATTESTATION_COMPLETED',
    metadata: { attestationId, title: att.title },
  });
}

export async function updateControlStatus(
  ctx: TenantContext,
  controlId: string,
  status: string,
  effectiveness?: number,
): Promise<void> {
  const control = await prisma.complianceControl.findUnique({ where: { id: controlId } });
  if (!control) throw new Error('Control not found');
  assertTenantAccess({ organizationId: ctx.organizationId }, control, 'ComplianceControl');

  await prisma.complianceControl.update({
    where: { id: controlId },
    data: { status, effectiveness, lastTestedAt: new Date() },
  });

  await writeAuditLog({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'COMPLIANCE_CONTROL_UPDATED',
    metadata: { controlId, status, effectiveness },
  });
}

export const getComplianceWorkspace = cache(
  unstable_cache(
    async (organizationId: string): Promise<ComplianceWorkspace> => {
      const scope = { organizationId };
      try {
        const now = new Date();
        const [
          highRiskApprovals,
          evidenceGaps,
          pendingAttestations,
          overdueIssues,
          openIssues,
          problemControls,
          playbooks,
        ] = await withTimeout(
          'compliance-workspace',
          Promise.all([
            prisma.approvalRecord.count({
              where: tenantScopedWhere(scope, {
                riskLevel: { in: ['high', 'critical'] },
                status: 'PENDING_REVIEW',
              }),
            }),
            prisma.approvalRecord.count({
              where: tenantScopedWhere(scope, {
                evidenceSnippet: null,
                status: { not: 'REJECTED' },
              }),
            }),
            prisma.complianceAttestation.findMany({
              where: tenantScopedWhere(scope, { status: 'PENDING' }),
              select: { id: true, title: true, policy: true, owner: true, dueDate: true },
              orderBy: { dueDate: 'asc' },
              take: 10,
            }),
            prisma.complianceIssue.findMany({
              where: tenantScopedWhere(scope, {
                status: { in: ['OPEN', 'IN_PROGRESS'] },
                dueDate: { lt: now },
              }),
              select: { id: true, title: true, severity: true, owner: true, dueDate: true, status: true },
              orderBy: { severity: 'desc' },
              take: 10,
            }),
            prisma.complianceIssue.findMany({
              where: tenantScopedWhere(scope, { status: { in: ['OPEN', 'IN_PROGRESS'] } }),
              include: {
                framework: { select: { name: true } },
                control: { select: { name: true } },
              },
              orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
              take: 8,
            }),
            prisma.complianceControl.findMany({
              where: tenantScopedWhere(scope, {
                status: { in: ['INEFFECTIVE', 'PARTIALLY_EFFECTIVE'] },
              }),
              include: { framework: { select: { name: true } } },
              orderBy: { status: 'asc' },
              take: 10,
            }),
            prisma.playbookDocument.findMany({
              where: tenantScopedWhere(scope),
              select: { id: true, name: true, status: true },
              orderBy: { createdAt: 'desc' },
              take: 8,
            }),
          ]),
          8000,
        );

        // Build actionItems
        const actionItems: ActionItem[] = [];
        if (highRiskApprovals > 0) {
          actionItems.push({
            type: 'high_risk_approvals',
            title: 'High-Risk Approvals Pending Review',
            subtitle: `${highRiskApprovals} approval${highRiskApprovals !== 1 ? 's' : ''} with high or critical risk awaiting review`,
            count: highRiskApprovals,
            severity: highRiskApprovals >= 5 ? 'critical' : 'high',
            href: '/approvals?riskLevel=high',
            actionLabel: 'Review Now',
          });
        }
        if (overdueIssues.length > 0) {
          actionItems.push({
            type: 'overdue_issues',
            title: 'Overdue Compliance Issues',
            subtitle: `${overdueIssues.length} issue${overdueIssues.length !== 1 ? 's' : ''} past their resolution deadline`,
            count: overdueIssues.length,
            severity: overdueIssues.some((i) => i.severity === 'CRITICAL') ? 'critical' : 'high',
            href: '/trust/compliance?tab=issues',
            actionLabel: 'Resolve Issues',
          });
        }
        if (pendingAttestations.length > 0) {
          actionItems.push({
            type: 'policy_acknowledgements',
            title: 'Attestations Awaiting Completion',
            subtitle: `${pendingAttestations.length} policy or control attestation${pendingAttestations.length !== 1 ? 's' : ''} pending sign-off`,
            count: pendingAttestations.length,
            severity: 'medium',
            href: '/trust/compliance?tab=attestations',
            actionLabel: 'Complete Now',
          });
        }
        if (evidenceGaps > 0) {
          actionItems.push({
            type: 'evidence_gaps',
            title: 'Approvals Missing Evidence',
            subtitle: `${evidenceGaps} approval record${evidenceGaps !== 1 ? 's' : ''} lack evidence documentation`,
            count: evidenceGaps,
            severity: 'medium',
            href: '/evidence',
            actionLabel: 'Fix Gaps',
          });
        }

        // Build workQueue
        const workQueue: WorkQueueItem[] = [];
        for (const att of pendingAttestations.slice(0, 3)) {
          const daysLeft = att.dueDate
            ? Math.ceil((att.dueDate.getTime() - now.getTime()) / 86_400_000)
            : null;
          workQueue.push({
            id: att.id,
            type: 'attestation',
            title: att.title,
            subtitle: att.policy ?? undefined,
            owner: att.owner ?? undefined,
            priority: daysLeft !== null && daysLeft <= 7 ? 'High' : 'Medium',
            dueLabel:
              daysLeft !== null
                ? daysLeft < 0
                  ? `${Math.abs(daysLeft)}d overdue`
                  : `Due in ${daysLeft}d`
                : undefined,
            dueUrgent: daysLeft !== null && daysLeft <= 7,
            status: 'PENDING',
            href: '/trust/compliance?tab=attestations',
            actionLabel: 'Complete',
          });
        }
        for (const issue of overdueIssues.slice(0, 3)) {
          const daysOverdue = issue.dueDate
            ? Math.ceil((now.getTime() - issue.dueDate.getTime()) / 86_400_000)
            : 0;
          workQueue.push({
            id: issue.id,
            type: 'investigation',
            title: issue.title,
            owner: issue.owner ?? undefined,
            priority: issue.severity === 'CRITICAL' || issue.severity === 'HIGH' ? 'High' : 'Medium',
            dueLabel: `${daysOverdue}d overdue`,
            dueUrgent: true,
            status: issue.status,
            href: '/trust/compliance?tab=issues',
            actionLabel: 'Resolve',
          });
        }
        for (const control of problemControls.slice(0, 3)) {
          workQueue.push({
            id: control.id,
            type: 'control',
            title: control.name,
            subtitle: control.framework?.name,
            owner: control.owner ?? undefined,
            priority: control.status === 'INEFFECTIVE' ? 'High' : 'Medium',
            dueLabel: control.nextReviewAt
              ? `Review by ${new Date(control.nextReviewAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              : undefined,
            dueUrgent: false,
            status: control.status,
            href: '/trust/compliance?tab=controls',
            actionLabel: 'Update Status',
          });
        }

        // topControls
        const topControls: WorkspaceControlRow[] = problemControls.slice(0, 8).map((c) => ({
          id: c.id,
          name: c.name,
          frameworkName: c.framework?.name,
          owner: c.owner ?? undefined,
          status: c.status,
          lastTestedAt: c.lastTestedAt ? c.lastTestedAt.toISOString() : undefined,
          href: '/trust/compliance?tab=controls',
        }));

        // recentIssues
        const recentIssues: IssueSummary[] = openIssues.map((issue) => ({
          id: issue.id,
          title: issue.title,
          description: issue.description,
          severity: issue.severity,
          status: issue.status,
          owner: issue.owner,
          dueDate: isoStr(issue.dueDate),
          frameworkName: issue.framework?.name ?? null,
          controlName: issue.control?.name ?? null,
          createdAt: issue.createdAt.toISOString(),
        }));

        // policyDocs
        const policyDocs: PolicyDocStatus[] = playbooks.map((doc) => {
          let state: PolicyDocStatus['state'];
          let detail: string;
          switch (doc.status) {
            case 'READY':
              state = 'compliant';
              detail = 'Active and indexed';
              break;
            case 'INDEXING':
            case 'UPLOADED':
              state = 'indexing';
              detail = 'Processing…';
              break;
            case 'ERROR':
              state = 'review_required';
              detail = 'Indexing failed — re-upload needed';
              break;
            case 'ARCHIVED':
            case 'SUPERSEDED':
              state = 'archived';
              detail = 'Archived';
              break;
            default:
              state = 'review_required';
              detail = 'Review required';
          }
          return { id: doc.id, name: doc.name, state, detail, href: '/playbooks' };
        });

        // Rule-based AI advisor
        let aiAdvisor: AIAdvisorInsight | null = null;
        if (highRiskApprovals >= 3) {
          aiAdvisor = {
            headline: `${highRiskApprovals} high-risk approvals need review`,
            whyItMatters:
              'Unreviewed high-risk approvals are a primary compliance gap that can affect audit readiness and increase regulatory exposure.',
            recommendedAction:
              'Review each approval, verify evidence documentation, and escalate any that require policy exceptions.',
            evidenceHref: '/approvals?riskLevel=high',
            copilotQuery: `What should I do about ${highRiskApprovals} pending high-risk approvals?`,
          };
        } else if (overdueIssues.length >= 2) {
          aiAdvisor = {
            headline: `${overdueIssues.length} compliance issues are past their deadline`,
            whyItMatters:
              'Overdue issues signal control failures that auditors specifically look for.',
            recommendedAction:
              'Assign owners, set resolution dates, and document remediation steps for each overdue issue.',
            evidenceHref: '/trust/compliance?tab=issues',
            copilotQuery: 'How do I remediate overdue compliance issues?',
          };
        } else if (problemControls.length >= 3) {
          const ineffective = problemControls.filter((c) => c.status === 'INEFFECTIVE').length;
          aiAdvisor = {
            headline: `${problemControls.length} controls need attention (${ineffective} ineffective)`,
            whyItMatters:
              'Ineffective controls are direct audit findings indicating compliance obligations are not being met.',
            recommendedAction:
              'Update control status, document remediation steps, and schedule re-assessment.',
            evidenceHref: '/trust/compliance?tab=controls',
            copilotQuery: 'What is the remediation process for ineffective compliance controls?',
          };
        } else if (pendingAttestations.length >= 2) {
          aiAdvisor = {
            headline: `${pendingAttestations.length} attestations awaiting sign-off`,
            whyItMatters: 'Incomplete attestations leave a gap in your evidence trail.',
            recommendedAction:
              'Complete pending attestations ensuring responsible owners review and sign off each one.',
            evidenceHref: '/trust/compliance?tab=attestations',
            copilotQuery: 'What attestations need to be completed for compliance?',
          };
        }

        return { actionItems, workQueue, topControls, recentIssues, policyDocs, aiAdvisor };
      } catch (err) {
        console.error('[compliance-workspace] failed', err);
        return {
          actionItems: [],
          workQueue: [],
          topControls: [],
          recentIssues: [],
          policyDocs: [],
          aiAdvisor: null,
        };
      }
    },
    ['compliance-workspace'],
    { revalidate: 60 },
  ),
);
