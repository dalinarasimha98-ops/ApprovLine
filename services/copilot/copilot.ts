import type { ApprovalRecord, AuditLog, InvestigationCase, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { buildExecutiveAnalytics } from '@/services/analytics';
import { searchPlaybookChunks } from '@/services/playbooks';
import { memoryEntityLabels, queryMemoryGraphForCopilot } from '@/services/memory';
import { withTimeout } from '@/lib/performance';

export type CopilotMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type CopilotCitation = {
  id: string;
  type: 'approval' | 'audit_log' | 'policy' | 'investigation' | 'analytics' | 'integration' | 'memory';
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
  'What is our approval policy for purchases above $50,000?',
  'Who needs to approve a new vendor contract?',
  'What does the Procurement Playbook require?',
  'Guide me through onboarding a new SaaS vendor.',
  'What documents do I need before submitting this approval?',
  'Which approvals require Legal review?',
  'Who approved Vendor ABC?',
  'Show all approvals above $50,000.',
  'Which approvals violated procurement policy?',
  'Why was this approval marked high risk?',
  'Show all decisions related to Project Phoenix.',
  'What approvals are missing Finance sign-off?',
  'Which departments have the highest compliance violations?',
  'Show all approvals from Slack last month.',
  'What can I do from this page?',
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
  // Policy/playbook direct questions — checked before generic compliance
  if (/\b(what (is|does|do|are) (our|the|this)|what('s| is) (our|the)|policy (for|on|about|require|say)|playbook (say|require|cover|define)|which (policy|playbook|policies)|policy version|compare (policy|version|playbook)|what (policy|playbook))\b/.test(lower)) return 'policy_lookup';
  // Guidance/workflow questions
  if (/\b(guide me|how (do|should) i|walk me through|step.by.step|what (do i|should i) (do|need)|what('s| is) the (process|workflow|path)|how (does|do) (the |an? )?approval|what (happens|should happen)|what (documents?|evidence) (do i|should i|are needed|required))\b/.test(lower)) return 'approval_guidance';
  // ApprovLine product help
  if (/\b(help me understand|explain (this|approvline|how)|what (can|could) (i|we) do|what (is|are) approvline|how (does|do) approvline|from this page|this page|can approvline|getting started)\b/.test(lower)) return 'approvline_help';
  if (/\b(who approved|approver|approved by)\b/.test(lower)) return 'approver_lookup';
  if (/\b(rejected|denied|not approved)\b/.test(lower)) return 'rejection_lookup';
  if (/\b(missing|finance sign-off|evidence missing)\b/.test(lower)) return 'missing_approval';
  if (/\b(violated|violation|non-compliant|non compliant|compliance)\b/.test(lower)) return 'compliance_policy';
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

function citationForMemoryEntity(source: Awaited<ReturnType<typeof queryMemoryGraphForCopilot>>[number]): CopilotCitation {
  const outgoing = source.outgoingRelationships.map((item) => `${item.relationshipType.replaceAll('_', ' ')} ${item.toEntity.title}`);
  const incoming = source.incomingRelationships.map((item) => `${item.relationshipType.replaceAll('_', ' ')} from ${item.fromEntity.title}`);
  return {
    id: source.id,
    type: 'memory',
    label: source.title,
    href: `/memory/${source.id}`,
    source: `Memory Graph · ${memoryEntityLabels[source.type]}`,
    excerpt: source.summary ?? ([...outgoing, ...incoming].slice(0, 3).join('; ') || `${memoryEntityLabels[source.type]} in the enterprise memory graph.`),
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

function memoryEvidenceLines(memory: Awaited<ReturnType<typeof queryMemoryGraphForCopilot>>) {
  return memory.slice(0, 4).map((entity) => {
    const relationships = [
      ...entity.outgoingRelationships.map((item) => `${item.relationshipType.replaceAll('_', ' ')} ${item.toEntity.title}`),
      ...entity.incomingRelationships.map((item) => `${item.relationshipType.replaceAll('_', ' ')} from ${item.fromEntity.title}`),
    ];
    return `Memory Graph: ${entity.title} (${memoryEntityLabels[entity.type]})${relationships.length ? ` connects to ${relationships.slice(0, 2).join(' and ')}` : ''}.`;
  });
}

function answerPolicy(policies: Awaited<ReturnType<typeof searchPlaybookChunks>>, _question: string): string {
  if (policies.length === 0) {
    return 'ApprovLine could not find a matching organizational policy for this question. Upload the relevant policy document to the Playbook Library to receive grounded, source-cited answers.';
  }
  const top = policies[0];
  const excerpt = top.content.slice(0, 380).trim();
  const others = policies.slice(1, 3).map((s) => `${s.documentName} (${s.sectionTitle})`);
  let answer = `According to ${top.documentName} — ${top.sectionTitle}: ${excerpt}${top.content.length > 380 ? '…' : ''}`;
  if (others.length > 0) {
    answer += ` Additional policies may also apply: ${others.join(' and ')}.`;
  }
  return answer;
}

function answerApprovalGuidance(policies: Awaited<ReturnType<typeof searchPlaybookChunks>>, question: string): string {
  if (policies.length === 0) {
    return 'To provide a step-by-step approval path, ApprovLine needs your organizational playbooks. Upload your procurement, finance, or relevant policy to the Playbook Library, then ask again for a guided approval path. You can also use Playbook AI Advisory for full AI-powered guidance.';
  }
  const docName = policies[0].documentName;
  const allText = policies.slice(0, 3).map((s) => s.content).join(' ').toLowerCase();
  const approverKeywords: [string, string][] = [
    ['cfo', 'CFO'],
    ['chief financial', 'CFO'],
    ['finance director', 'Finance Director'],
    ['finance manager', 'Finance Manager'],
    ['legal', 'Legal Counsel'],
    ['general counsel', 'General Counsel'],
    ['security', 'Security / CISO'],
    ['ciso', 'CISO'],
    ['procurement', 'Procurement Manager'],
    ['board', 'Board Approval'],
    ['committee', 'Committee Review'],
  ];
  const approvers: string[] = [];
  for (const [kw, label] of approverKeywords) {
    if (allText.includes(kw) && !approvers.includes(label)) approvers.push(label);
  }
  const lowerQ = question.toLowerCase();
  if (/vendor|supplier|onboard/.test(lowerQ) && !approvers.includes('Procurement Manager')) {
    approvers.unshift('Procurement Manager');
  }
  const steps = [
    '1. Submit a complete approval request with supporting documentation and business justification.',
    ...approvers.slice(0, 4).map((a, i) => `${i + 2}. Obtain ${a} approval.`),
    `${approvers.length + 2}. Record the final decision and evidence in ApprovLine for audit trail.`,
  ];
  return `Based on ${docName}, here is the recommended approval path:\n\n${steps.join('\n')}\n\nOpen the policy citations below for specific thresholds, required evidence, and escalation conditions.`;
}

function answerApprovLineHelp(question: string): string {
  const lower = question.toLowerCase();
  if (/playbook|policy/.test(lower)) {
    return 'Playbook AI Advisory in ApprovLine analyzes your uploaded policy documents to guide approvals. Navigate to Playbooks, upload a policy PDF or DOCX, then ask AI Advisor about any approval type to receive a step-by-step path grounded in your actual policies.';
  }
  if (/approval|workflow|process/.test(lower)) {
    return 'ApprovLine captures approval decisions from Slack, Gmail, Teams, Outlook, Jira, Zoom, and enterprise systems (SAP, Oracle, Coupa, Workday, Salesforce). Each approval is classified, evaluated against your policies, and paired with an auditable evidence trail. Connect integrations under Settings → Integrations to start ingesting approvals.';
  }
  if (/evidence|audit|trail/.test(lower)) {
    return 'Every captured approval in ApprovLine is linked to its source evidence — message links, attachments, email threads, and compliance evaluations. The Evidence Platform unifies these into a single auditable record per approval. View them under the Evidence tab or open any approval to see its evidence trail.';
  }
  if (/investigation|flag|case/.test(lower)) {
    return 'The Investigation Center lets you flag approvals for review, attach notes and evidence, track case status (Open → Under Review → Closed), and export a full audit-ready case report. Open any approval record and click "Add to Investigation" to begin.';
  }
  if (/memory|graph|entity/.test(lower)) {
    return 'The Memory Graph maps relationships between approvals, approvers, vendors, policies, risks, and investigation cases. It surfaces hidden patterns — like a vendor appearing in multiple high-risk approvals — that linear search misses. Explore it under Memory Graph in the navigation.';
  }
  if (/analytics|dashboard|roi|report/.test(lower)) {
    return 'ApprovLine Analytics surfaces approval volume trends, compliance scores, department-level risk, time-to-approval patterns, and executive ROI metrics. The AI Copilot can also generate real-time summaries — try asking "Summarize high-risk approvals this quarter".';
  }
  return 'ApprovLine is an AI-powered approval intelligence platform. It captures decisions from your communications tools and enterprise systems, classifies them against your policies, and maintains an auditable evidence trail per approval. Use the main navigation to explore: Approvals, Evidence, Playbooks, Memory Graph, Analytics, and the Investigation Center.';
}

function recommendedActions(intent: string, approvals: ApprovalWithEvidence[], policies: Awaited<ReturnType<typeof searchPlaybookChunks>>) {
  const actions = new Set<string>();
  if (intent === 'policy_lookup') {
    actions.add(policies.length > 0 ? 'Open the cited policy section for full thresholds and requirements.' : 'Upload your organizational policy to Playbook AI for grounded answers.');
    if (policies.length > 1) actions.add('Check whether multiple conflicting policies apply to this request.');
  } else if (intent === 'approval_guidance') {
    actions.add('Visit Playbook AI Advisory for a complete, AI-generated approval path tailored to your request.');
    if (policies.length > 0) actions.add('Review the cited policy sections for specific evidence and escalation requirements.');
  } else if (intent === 'approvline_help') {
    actions.add('Explore the navigation to find the feature relevant to your question.');
    actions.add('Upload a policy document to Playbook AI to enable AI-guided approvals.');
  } else {
    if (approvals.some((approval) => approval.riskLevel === 'high' || approval.riskLevel === 'critical')) actions.add('Open the high-risk approval and review its evidence trail.');
    if (approvals.some((approval) => !approval.sourceLink || !approval.evidenceSnippet)) actions.add('Attach or verify missing source evidence before audit export.');
    if (approvals.some((approval) => approval.complianceEvaluations.some((item) => item.status !== 'Compliant'))) actions.add('Review the triggered playbook rule and resolve missing approvers or evidence.');
    if (intent === 'investigation') actions.add('Create or open an investigation case for the related approval records.');
    if (policies.length === 0 && intent !== 'executive_intelligence') actions.add('Upload the relevant playbook to improve policy-backed answers.');
  }
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
  const [approvals, policies, memory] = await Promise.all([
    retrieveApprovals(input.organizationId, question, intent),
    retrievePolicies(input.organizationId, question),
    safe('memory graph retrieval', queryMemoryGraphForCopilot(input.organizationId, question), [] as Awaited<ReturnType<typeof queryMemoryGraphForCopilot>>, 2500),
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
  if (intent === 'policy_lookup') answer = answerPolicy(policies, question);
  if (intent === 'approval_guidance') answer = answerApprovalGuidance(policies, question);
  if (intent === 'approvline_help') answer = answerApprovLineHelp(question);
  if (approvals.length === 0 && memory.length > 0) {
    const top = memory
      .slice(0, 4)
      .map((entity) => `${entity.title} (${memoryEntityLabels[entity.type]}, risk ${entity.riskScore})`)
      .join('; ');
    answer = `I found ${memory.length} connected Memory Graph entities: ${top}. Open the cited graph nodes to inspect related approvals, risks, policies, evidence, and investigations.`;
  }

  const sources = [
    ...approvals.slice(0, 6).map(citationForApproval),
    ...audits.slice(0, 4).map(citationForAudit),
    ...investigations.slice(0, 4).map(citationForInvestigation),
    ...policies.slice(0, 4).map(citationForPolicy),
    ...memory.slice(0, 5).map(citationForMemoryEntity),
    ...(executive ? [executive.citation] : []),
  ];

  const relatedRecords = sources.slice(0, 6).map((source) => ({ label: source.label, href: source.href }));
  const response = {
    answer,
    supportingEvidence: [...evidenceLines(approvals, audits, policies), ...memoryEvidenceLines(memory)].slice(0, 7),
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
        memoryEntityCount: memory.length,
        historyLength: input.history?.length ?? 0,
      } as Prisma.InputJsonValue,
    },
  }).catch((error) => {
    console.warn('[copilot] audit log unavailable', error);
  });

  return response;
}
