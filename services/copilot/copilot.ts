import type { ApprovalRecord, AuditLog, InvestigationCase, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { buildExecutiveAnalytics } from '@/services/analytics';
import { searchPlaybookChunks } from '@/services/playbooks';
import { withTimeout } from '@/lib/performance';

export type CopilotMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type CopilotCitation = {
  id: string;
  type: 'approval' | 'audit_log' | 'policy' | 'investigation' | 'analytics' | 'integration';
  label: string;
  href: string;
  excerpt: string;
  source: string;
};

export type CopilotAnswer = {
  answer: string;
  supportingEvidence: string[];
  sources: CopilotCitation[];
  confidence: number;
  recommendedActions: string[];
  relatedRecords: Array<{ label: string; href: string }>;
  intent: string;
};

type ApprovalWithEvidence = ApprovalRecord & {
  messageSource: {
    provider: string;
    channel: string | null;
    sender: string | null;
    senderEmail: string | null;
    rawPayload: Prisma.JsonValue | null;
  } | null;
  complianceEvaluations: Array<{
    status: string;
    score: number;
    severity: string;
    missingApprovers: string[];
    missingDepartments: string[];
    missingEvidence: string[];
    triggeredRule: string | null;
    explanation: string;
  }>;
  investigations: Array<{
    investigation: Pick<InvestigationCase, 'id' | 'title' | 'status' | 'riskLevel'>;
  }>;
};

const suggestions = [
  'Who approved Vendor ABC?',
  'Show all approvals above $50,000.',
  'Which approvals violated procurement policy?',
  'Why was this approval marked high risk?',
  'Show all decisions related to Project Phoenix.',
  'What approvals are missing Finance sign-off?',
  'Which departments have the highest compliance violations?',
  'Show all approvals from Slack last month.',
  'Summarize all high-risk approvals this quarter.',
];

const sourceLabels: Record<string, string> = {
  slack: 'Slack Message',
  gmail: 'Gmail Email',
  outlook: 'Outlook Email',
  microsoft_teams: 'Teams Message',
  teams: 'Teams Message',
  jira: 'Jira Ticket',
  zoom: 'Zoom Transcript',
  servicenow: 'ServiceNow Request',
  universal_gateway: 'Universal Gateway Event',
};

export function copilotSuggestions() {
  return suggestions;
}

function normalize(value?: string | null) {
  return value?.toLowerCase().trim() ?? '';
}

function sourceLabel(value?: string | null) {
  const key = normalize(value).replaceAll(' ', '_');
  return sourceLabels[key] ?? (value ? `${value} Evidence` : 'Approval Evidence');
}

function tokenize(question: string) {
  const stop = new Set([
    'who',
    'what',
    'when',
    'where',
    'why',
    'show',
    'all',
    'the',
    'and',
    'or',
    'for',
    'from',
    'this',
    'that',
    'with',
    'approval',
    'approvals',
    'decision',
    'decisions',
    'related',
    'summarize',
  ]);
  return [...new Set((question.toLowerCase().match(/[a-z0-9$,.#-]+/g) ?? []).filter((token) => token.length > 2 && !stop.has(token)))];
}

function detectIntent(question: string) {
  const lower = question.toLowerCase();
  if (/\b(who approved|approver|approved by)\b/.test(lower)) return 'approver_lookup';
  if (/\b(rejected|denied|not approved)\b/.test(lower)) return 'rejection_lookup';
  if (/\b(missing|finance sign-off|required|evidence missing)\b/.test(lower)) return 'missing_approval';
  if (/\b(violated|violation|non-compliant|non compliant|compliance|policy)\b/.test(lower)) return 'compliance_policy';
  if (/\b(high-risk|high risk|risky|risk)\b/.test(lower)) return 'risk_summary';
  if (/\b(investigation|flagged|case)\b/.test(lower)) return 'investigation';
  if (/\b(vendor|contract|supplier)\b/.test(lower)) return 'vendor_intelligence';
  if (/\b(department|finance|procurement|legal|engineering|security|hr)\b/.test(lower)) return 'department_intelligence';
  if (/\b(month|quarter|time saved|executive|score|summary|roi)\b/.test(lower)) return 'executive_intelligence';
  return 'approval_search';
}

function extractAmount(question: string) {
  const match = question.match(/\$?\s?([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)(k|m|million|thousand)?/i);
  if (!match) return null;
  const base = Number(match[1].replaceAll(',', ''));
  const suffix = match[2]?.toLowerCase();
  if (!Number.isFinite(base)) return null;
  if (suffix === 'm' || suffix === 'million') return base * 1_000_000;
  if (suffix === 'k' || suffix === 'thousand') return base * 1_000;
  return base;
}

function amountFromApproval(approval: Pick<ApprovalRecord, 'subject' | 'businessImpact' | 'evidenceSnippet' | 'reasoning'>) {
  const match = [approval.subject, approval.businessImpact, approval.evidenceSnippet, approval.reasoning]
    .filter(Boolean)
    .join(' ')
    .match(/\$?\s?([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)(k|m|million|thousand)?/i);
  if (!match) return null;
  const base = Number(match[1].replaceAll(',', ''));
  const suffix = match[2]?.toLowerCase();
  if (!Number.isFinite(base)) return null;
  if (suffix === 'm' || suffix === 'million') return base * 1_000_000;
  if (suffix === 'k' || suffix === 'thousand') return base * 1_000;
  return base;
}

function scoreApproval(questionTokens: string[], approval: ApprovalWithEvidence) {
  const text = [
    approval.subject,
    approval.approverName,
    approval.approverEmail,
    approval.department,
    approval.category,
    approval.sourcePlatform,
    approval.businessImpact,
    approval.reasoning,
    approval.conditions,
    approval.evidenceSnippet,
    approval.messageSource?.channel,
    approval.messageSource?.sender,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return questionTokens.reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0);
}

async function safe<T>(label: string, query: Promise<T>, fallback: T, timeoutMs = 1500) {
  try {
    return await withTimeout(`copilot ${label}`, query, timeoutMs);
  } catch (error) {
    console.warn(`[copilot] ${label} unavailable`, error);
    return fallback;
  }
}

async function retrieveApprovals(organizationId: string, question: string, intent: string) {
  const lower = question.toLowerCase();
  const amount = extractAmount(question);
  const source = ['slack', 'gmail', 'outlook', 'teams', 'jira', 'zoom', 'servicenow'].find((item) => lower.includes(item));
  const department = ['Finance', 'Procurement', 'Legal', 'Engineering', 'Security', 'Compliance', 'HR'].find((item) => lower.includes(item.toLowerCase()));
  const where: Prisma.ApprovalRecordWhereInput = {
    organizationId,
    ...(source ? { sourcePlatform: { contains: source, mode: 'insensitive' } } : {}),
    ...(department ? { OR: [{ department }, { category: department }] } : {}),
    ...(intent === 'risk_summary' ? { OR: [{ riskLevel: 'high' }, { riskLevel: 'critical' }] } : {}),
    ...(intent === 'rejection_lookup' ? { OR: [{ status: 'REJECTED' }, { approvalType: 'REJECTION' }] } : {}),
    ...(intent === 'missing_approval' ? { OR: [{ status: 'PENDING_REVIEW' }, { evidenceSnippet: null }, { sourceLink: null }] } : {}),
    ...(intent === 'compliance_policy' ? { complianceEvaluations: { some: { status: { not: 'Compliant' } } } } : {}),
  };

  const approvals = await safe(
    'approvals retrieval',
    prisma.approvalRecord.findMany({
      where,
      include: {
        messageSource: {
          select: {
            provider: true,
            channel: true,
            sender: true,
            senderEmail: true,
            rawPayload: true,
          },
        },
        complianceEvaluations: {
          orderBy: { createdAt: 'desc' },
          take: 2,
          select: {
            status: true,
            score: true,
            severity: true,
            missingApprovers: true,
            missingDepartments: true,
            missingEvidence: true,
            triggeredRule: true,
            explanation: true,
          },
        },
        investigations: {
          take: 3,
          include: {
            investigation: {
              select: { id: true, title: true, status: true, riskLevel: true },
            },
          },
        },
      },
      orderBy: [{ riskLevel: 'desc' }, { confidence: 'desc' }, { createdAt: 'desc' }],
      take: 60,
    }),
    [] as ApprovalWithEvidence[],
  );

  const tokens = tokenize(question);
  const amountFiltered = amount
    ? approvals.filter((approval) => {
        const approvalAmount = amountFromApproval(approval);
        return approvalAmount === null || approvalAmount >= amount;
      })
    : approvals;

  return amountFiltered
    .map((approval) => ({ approval, score: scoreApproval(tokens, approval) }))
    .sort((left, right) => right.score - left.score || right.approval.confidence - left.approval.confidence)
    .map((item) => item.approval)
    .slice(0, 12);
}

async function retrieveAuditLogs(organizationId: string, approvals: ApprovalWithEvidence[]) {
  const approvalIds = approvals.map((approval) => approval.id);
  if (approvalIds.length === 0) return [];
  return safe(
    'audit log retrieval',
    prisma.auditLog.findMany({
      where: { organizationId, approvalRecordId: { in: approvalIds } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    [] as AuditLog[],
  );
}

async function retrieveInvestigations(organizationId: string, question: string, approvals: ApprovalWithEvidence[]) {
  const tokens = tokenize(question);
  const approvalIds = approvals.map((approval) => approval.id);
  return safe(
    'investigation retrieval',
    prisma.investigationCase.findMany({
      where: {
        organizationId,
        OR: [
          { approvals: { some: { approvalRecordId: { in: approvalIds } } } },
          ...tokens.map((token) => ({ title: { contains: token, mode: 'insensitive' as const } })),
        ],
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 8,
    }),
    [] as InvestigationCase[],
  );
}

async function retrievePolicies(organizationId: string, question: string) {
  return safe('policy retrieval', searchPlaybookChunks(organizationId, question, 5), [] as Awaited<ReturnType<typeof searchPlaybookChunks>>, 2500);
}

function citationForApproval(approval: ApprovalWithEvidence): CopilotCitation {
  return {
    id: approval.id,
    type: 'approval',
    label: approval.subject,
    href: `/approvals/${approval.id}`,
    source: sourceLabel(approval.sourcePlatform),
    excerpt: approval.evidenceSnippet ?? approval.reasoning,
  };
}

function citationForAudit(log: AuditLog): CopilotCitation {
  return {
    id: log.id,
    type: 'audit_log',
    label: log.action.replaceAll('.', ' '),
    href: '/dashboard/audit',
    source: 'Audit Log',
    excerpt: JSON.stringify(log.metadata ?? {}).slice(0, 220) || `Audit event recorded ${log.createdAt.toLocaleDateString()}.`,
  };
}

function citationForInvestigation(investigation: InvestigationCase): CopilotCitation {
  return {
    id: investigation.id,
    type: 'investigation',
    label: investigation.title,
    href: `/investigations/${investigation.id}`,
    source: 'Investigation Case',
    excerpt: investigation.summary ?? `${investigation.status.toLowerCase()} case with ${investigation.riskLevel ?? 'unscored'} risk.`,
  };
}

function citationForPolicy(source: Awaited<ReturnType<typeof searchPlaybookChunks>>[number]): CopilotCitation {
  return {
    id: source.chunkId,
    type: 'policy',
    label: `${source.documentName} · ${source.sectionTitle}`,
    href: '/playbooks',
    source: 'Policy Section',
    excerpt: source.content.slice(0, 260),
  };
}

function answerApprover(approvals: ApprovalWithEvidence[]) {
  const approval = approvals[0];
  if (!approval) return 'I could not find a matching approval record yet.';
  const date = approval.approvalTimestamp ?? approval.occurredAt;
  return `${approval.subject} was approved by ${approval.approverName ?? 'an unknown approver'}${approval.approverEmail ? ` (${approval.approverEmail})` : ''} on ${date.toLocaleDateString()} from ${approval.sourcePlatform ?? 'an unknown source'}.`;
}

function answerList(approvals: ApprovalWithEvidence[], label: string) {
  if (approvals.length === 0) return `I could not find ${label} in the current workspace.`;
  const top = approvals
    .slice(0, 5)
    .map((approval) => `${approval.subject} (${approval.approverName ?? 'unknown approver'}, ${approval.department ?? 'unassigned'}, ${approval.confidence}% confidence)`)
    .join('; ');
  return `I found ${approvals.length} ${label}. The strongest matches are: ${top}.`;
}

function answerCompliance(approvals: ApprovalWithEvidence[], policies: Awaited<ReturnType<typeof searchPlaybookChunks>>) {
  const nonCompliant = approvals.filter((approval) => approval.complianceEvaluations.some((item) => item.status !== 'Compliant'));
  if (nonCompliant.length === 0) {
    return policies.length
      ? `I did not find recorded policy violations in the matched approvals. The closest policy source is ${policies[0].documentName}, ${policies[0].sectionTitle}.`
      : 'I did not find recorded policy violations. Upload playbooks or run compliance evaluation for stronger policy-backed answers.';
  }
  const findings = nonCompliant
    .slice(0, 4)
    .map((approval) => {
      const evaluation = approval.complianceEvaluations[0];
      return `${approval.subject}: ${evaluation.status}, ${evaluation.score}/100${evaluation.triggeredRule ? ` against ${evaluation.triggeredRule}` : ''}`;
    })
    .join('; ');
  return `I found ${nonCompliant.length} approvals with compliance concerns. ${findings}.`;
}

function answerInvestigation(investigations: InvestigationCase[], approvals: ApprovalWithEvidence[]) {
  if (investigations.length > 0) {
    const top = investigations.slice(0, 4).map((item) => `${item.title} (${item.status.toLowerCase()}, ${item.riskLevel ?? 'unscored'} risk)`).join('; ');
    return `I found ${investigations.length} related investigation cases: ${top}.`;
  }
  return approvals.length
    ? `No investigation case is attached to the strongest matching approvals yet. ${approvals.length} approval records are available to investigate.`
    : 'No related investigations or approval records were found.';
}

function evidenceLines(approvals: ApprovalWithEvidence[], audits: AuditLog[], policies: Awaited<ReturnType<typeof searchPlaybookChunks>>) {
  const lines = [
    ...approvals.slice(0, 5).map((approval) => `${sourceLabel(approval.sourcePlatform)}: ${approval.evidenceSnippet ?? approval.reasoning}`),
    ...audits.slice(0, 3).map((log) => `Audit Log: ${log.action.replaceAll('.', ' ')} on ${log.createdAt.toLocaleDateString()}`),
    ...policies.slice(0, 2).map((source) => `Policy: ${source.documentName}, ${source.sectionTitle}`),
  ];
  return lines.length ? lines : ['No source evidence matched the question yet.'];
}

function recommendedActions(intent: string, approvals: ApprovalWithEvidence[], policies: Awaited<ReturnType<typeof searchPlaybookChunks>>) {
  const actions = new Set<string>();
  if (approvals.some((approval) => approval.riskLevel === 'high' || approval.riskLevel === 'critical')) actions.add('Open the high-risk approval and review its evidence trail.');
  if (approvals.some((approval) => !approval.sourceLink || !approval.evidenceSnippet)) actions.add('Attach or verify missing source evidence before audit export.');
  if (approvals.some((approval) => approval.complianceEvaluations.some((item) => item.status !== 'Compliant'))) actions.add('Review the triggered playbook rule and resolve missing approvers or evidence.');
  if (intent === 'investigation') actions.add('Create or open an investigation case for the related approval records.');
  if (policies.length === 0) actions.add('Upload the relevant playbook to improve policy-backed answers.');
  if (actions.size === 0) actions.add('Open the cited records to validate the decision trail before sharing externally.');
  return [...actions].slice(0, 4);
}

function confidenceFor(approvals: ApprovalWithEvidence[], policies: Awaited<ReturnType<typeof searchPlaybookChunks>>, audits: AuditLog[]) {
  if (approvals.length === 0 && policies.length === 0) return 48;
  const approvalConfidence = approvals.length
    ? Math.round(approvals.slice(0, 5).reduce((sum, approval) => sum + approval.confidence, 0) / Math.min(approvals.length, 5))
    : 70;
  const evidenceBoost = Math.min(10, approvals.filter((approval) => approval.evidenceSnippet && approval.sourceLink).length * 2);
  const policyBoost = Math.min(8, policies.length * 2);
  const auditBoost = Math.min(5, audits.length);
  return Math.max(55, Math.min(98, approvalConfidence + evidenceBoost + policyBoost + auditBoost - 8));
}

async function executiveAnswer(organizationId: string) {
  const analytics = await safe('executive analytics', buildExecutiveAnalytics(organizationId, { demoProjection: false }), null, 2500);
  if (!analytics) return null;
  return {
    answer: analytics.summary,
    citation: {
      id: 'executive-analytics',
      type: 'analytics' as const,
      label: 'Executive ROI Dashboard',
      href: '/analytics',
      source: 'Executive Analytics',
      excerpt: `Traceability ${analytics.complianceReadiness.approvalTraceability}%, evidence coverage ${analytics.complianceReadiness.evidenceCoverage}%, ${analytics.timeSaved.totalHours} hours saved.`,
    },
  };
}

export async function answerCopilotQuestion(input: {
  organizationId: string;
  actorUserId?: string;
  question: string;
  history?: CopilotMessage[];
}): Promise<CopilotAnswer> {
  const question = input.question.trim();
  const intent = detectIntent(question);
  const [approvals, policies] = await Promise.all([
    retrieveApprovals(input.organizationId, question, intent),
    retrievePolicies(input.organizationId, question),
  ]);
  const [audits, investigations, executive] = await Promise.all([
    retrieveAuditLogs(input.organizationId, approvals),
    retrieveInvestigations(input.organizationId, question, approvals),
    intent === 'executive_intelligence' ? executiveAnswer(input.organizationId) : Promise.resolve(null),
  ]);

  let answer = executive?.answer ?? answerList(approvals, 'matching approval records');
  if (intent === 'approver_lookup') answer = answerApprover(approvals);
  if (intent === 'rejection_lookup') answer = answerList(approvals, 'rejections');
  if (intent === 'missing_approval') answer = answerList(approvals, 'approval records with missing sign-off or evidence');
  if (intent === 'compliance_policy') answer = answerCompliance(approvals, policies);
  if (intent === 'risk_summary') answer = answerList(approvals, 'high-risk approval records');
  if (intent === 'investigation') answer = answerInvestigation(investigations, approvals);
  if (intent === 'vendor_intelligence') answer = answerList(approvals, 'vendor-related approvals');
  if (intent === 'department_intelligence') answer = answerList(approvals, 'department-related approvals');

  const sources = [
    ...approvals.slice(0, 6).map(citationForApproval),
    ...audits.slice(0, 4).map(citationForAudit),
    ...investigations.slice(0, 4).map(citationForInvestigation),
    ...policies.slice(0, 4).map(citationForPolicy),
    ...(executive ? [executive.citation] : []),
  ];

  const relatedRecords = sources.slice(0, 6).map((source) => ({ label: source.label, href: source.href }));
  const response = {
    answer,
    supportingEvidence: evidenceLines(approvals, audits, policies).slice(0, 7),
    sources,
    confidence: confidenceFor(approvals, policies, audits),
    recommendedActions: recommendedActions(intent, approvals, policies),
    relatedRecords,
    intent,
  };

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'copilot.query.answered',
      metadata: {
        question,
        intent,
        confidence: response.confidence,
        sourceCount: response.sources.length,
        historyLength: input.history?.length ?? 0,
      } as Prisma.InputJsonValue,
    },
  }).catch((error) => {
    console.warn('[copilot] audit log unavailable', error);
  });

  return response;
}
