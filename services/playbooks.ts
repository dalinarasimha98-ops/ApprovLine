import crypto from 'node:crypto';
import zlib from 'node:zlib';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import type { ApprovalRecord, PlaybookRule, Prisma } from '@prisma/client';

const embeddingDimensions = 96;

type SourceMatch = {
  chunkId: string;
  documentId: string;
  documentName: string;
  sectionTitle: string;
  content: string;
  score: number;
};

export type PlaybookAnswer = {
  answer: string;
  requiredApprovers: string[];
  requiredDepartments: string[];
  policySections: Array<{ document: string; section: string; excerpt: string }>;
  evidenceMissing: string[];
  compliant: 'yes' | 'no' | 'needs_review';
  confidence: number;
};

export type ExtractedPlaybookRule = {
  category: string;
  title: string;
  description: string;
  requiredApprovers: string[];
  requiredDepartments: string[];
  escalationChain: string[];
  spendingLimit?: number;
  riskTriggers: string[];
  evidenceRequired: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  sourceSection?: string;
  sourceExcerpt: string;
};

const playbookCategories = ['Legal', 'Procurement', 'Finance', 'Security', 'Compliance', 'HR', 'Engineering'];

function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stripBinaryNoise(value: string) {
  return value
    .replace(/\u0000/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractZipEntry(buffer: Buffer, targetName: string) {
  let offset = 0;
  while (offset < buffer.length - 30) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');
    const dataStart = nameStart + fileNameLength + extraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    if (name === targetName) {
      if (compression === 0) return data.toString('utf8');
      if (compression === 8) return zlib.inflateRawSync(data).toString('utf8');
      return null;
    }

    offset = dataStart + compressedSize;
  }
  return null;
}

export async function extractPlaybookText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const extension = file.name.split('.').pop()?.toLowerCase() ?? 'txt';

  if (extension === 'txt' || extension === 'md' || file.type.includes('text')) {
    return stripBinaryNoise(raw);
  }

  if (extension === 'pdf') {
    const textFragments = raw.match(/\(([^()]{8,})\)/g)?.map((item) => item.slice(1, -1)) ?? [];
    const fallback = textFragments.length > 10 ? textFragments.join('\n') : raw.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ');
    return stripBinaryNoise(fallback);
  }

  if (extension === 'docx') {
    const documentXml = extractZipEntry(buffer, 'word/document.xml') ?? raw;
    const xmlText = documentXml
      .replace(/<w:p[^>]*>/g, '\n')
      .replace(/<w:tab\/>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    return stripBinaryNoise(xmlText);
  }

  return stripBinaryNoise(raw);
}

function sectionTitleFor(chunk: string, index: number) {
  const heading = chunk
    .split('\n')
    .map((line) => line.trim().replace(/^#+\s*/, ''))
    .find((line) => line.length > 0 && line.length < 90);
  return heading ?? `Section ${index + 1}`;
}

function inferCategory(text: string, fallback?: string) {
  if (fallback && playbookCategories.includes(fallback)) return fallback;
  const lower = text.toLowerCase();
  if (/\b(contract|msa|legal|redline|liability|indemnity|terms)\b/.test(lower)) return 'Legal';
  if (/\b(procurement|vendor|supplier|purchase|po|payment terms)\b/.test(lower)) return 'Procurement';
  if (/\b(finance|budget|spend|invoice|payment|cost center|cfo)\b/.test(lower)) return 'Finance';
  if (/\b(security|soc 2|access|production|vulnerability|subprocessor)\b/.test(lower)) return 'Security';
  if (/\b(compliance|gdpr|audit|retention|governance|control)\b/.test(lower)) return 'Compliance';
  if (/\b(hr|candidate|compensation|employee|offer)\b/.test(lower)) return 'HR';
  if (/\b(engineering|release|code|deploy|architecture)\b/.test(lower)) return 'Engineering';
  return fallback || 'Compliance';
}

function amountThreshold(text: string) {
  const matches = [...text.matchAll(/\$?\s?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s?(?:k|K|000)?/g)];
  const values = matches
    .map((match) => {
      const raw = match[1].replaceAll(',', '');
      const base = Number(raw);
      const suffix = match[0].toLowerCase().includes('k') ? 1000 : 1;
      const thousands = /\b000\b/.test(match[0]) && base < 1000 ? 1000 : 1;
      return base * suffix * thousands;
    })
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : undefined;
}

function approversFromText(text: string) {
  const lower = text.toLowerCase();
  const approvers = new Set<string>();
  if (lower.includes('legal')) approvers.add('Legal');
  if (lower.includes('procurement')) approvers.add('Procurement');
  if (lower.includes('finance')) approvers.add('Finance');
  if (lower.includes('cfo')) approvers.add('CFO');
  if (lower.includes('security')) approvers.add('Security');
  if (lower.includes('compliance')) approvers.add('Compliance');
  if (lower.includes('hr') || lower.includes('people')) approvers.add('HR');
  if (lower.includes('manager')) approvers.add('Manager');
  if (lower.includes('department head')) approvers.add('Department Head');
  return [...approvers];
}

function evidenceFromText(text: string) {
  const lower = text.toLowerCase();
  const evidence = new Set<string>();
  if (lower.includes('redline')) evidence.add('Final redlines');
  if (lower.includes('budget')) evidence.add('Budget owner approval');
  if (lower.includes('soc 2')) evidence.add('SOC 2 report');
  if (lower.includes('risk review')) evidence.add('Risk review');
  if (lower.includes('intake')) evidence.add('Intake form');
  if (lower.includes('cost center')) evidence.add('Cost center');
  if (lower.includes('business justification')) evidence.add('Business justification');
  if (lower.includes('signature authority')) evidence.add('Signature authority');
  return [...evidence];
}

function severityForRule(text: string, spendingLimit?: number): ExtractedPlaybookRule['severity'] {
  const lower = text.toLowerCase();
  if (lower.includes('critical') || spendingLimit && spendingLimit >= 100000 || lower.includes('production access')) return 'critical';
  if (lower.includes('security') || lower.includes('legal') || spendingLimit && spendingLimit >= 25000) return 'high';
  if (spendingLimit && spendingLimit >= 10000) return 'medium';
  return 'medium';
}

export function extractPlaybookRules(content: string, category?: string): ExtractedPlaybookRule[] {
  const chunks = chunkPlaybookContent(content);
  const rules: ExtractedPlaybookRule[] = [];

  chunks.forEach((chunk, index) => {
    const sentences = chunk.split(/(?<=[.!?])\s+|\n+/).map((item) => item.trim()).filter(Boolean);
    const ruleSentences = sentences.filter((sentence) => /\b(require|required|must|approval|approv|escalat|above|over|greater than|evidence|review)\b/i.test(sentence));
    const source = ruleSentences.join(' ').slice(0, 1200) || chunk.slice(0, 1200);
    if (source.length < 20) return;

    const spendingLimit = amountThreshold(source);
    const requiredApprovers = approversFromText(source);
    const inferredCategory = inferCategory(source, category);
    const requiredDepartments = requiredApprovers.length
      ? requiredApprovers.filter((item) => !['CFO', 'Manager', 'Department Head'].includes(item))
      : [inferredCategory];
    const evidenceRequired = evidenceFromText(source);
    const escalationChain = source.toLowerCase().includes('escalat') || source.toLowerCase().includes('cfo') ? ['Manager', 'Department Head', 'CFO'].filter((item) => source.toLowerCase().includes(item.toLowerCase()) || item === 'CFO') : [];
    const titleAmount = spendingLimit ? ` above $${new Intl.NumberFormat('en-US').format(spendingLimit)}` : '';

    rules.push({
      category: inferredCategory,
      title: `${inferredCategory} approval rule${titleAmount}`,
      description: source.slice(0, 500),
      requiredApprovers: requiredApprovers.length ? requiredApprovers : [`${inferredCategory} approval`],
      requiredDepartments: requiredDepartments.length ? requiredDepartments : [inferredCategory],
      escalationChain,
      spendingLimit,
      riskTriggers: [
        ...(source.toLowerCase().includes('customer data') ? ['Customer data access'] : []),
        ...(source.toLowerCase().includes('production') ? ['Production system access'] : []),
        ...(source.toLowerCase().includes('non-standard') ? ['Non-standard terms'] : []),
      ],
      evidenceRequired: evidenceRequired.length ? evidenceRequired : ['Approval evidence', 'Source message link'],
      severity: severityForRule(source, spendingLimit),
      sourceSection: sectionTitleFor(chunk, index),
      sourceExcerpt: source,
    });
  });

  return rules.slice(0, 20);
}

export function chunkPlaybookContent(content: string) {
  const paragraphs = content.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs.length ? paragraphs : [content]) {
    if (`${current}\n\n${paragraph}`.length > 1800 && current.length > 0) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [content.slice(0, 1800)];
}

function localEmbedding(text: string) {
  const vector = Array.from({ length: embeddingDimensions }, () => 0);
  const tokens = text.toLowerCase().match(/[a-z0-9$,.]+/g) ?? [];
  for (const token of tokens) {
    const hash = crypto.createHash('sha1').update(token).digest();
    const index = hash[0] % embeddingDimensions;
    vector[index] += 1 + Math.min(token.length, 12) / 12;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

export async function embedText(text: string) {
  if (!env.OPENAI_API_KEY) return localEmbedding(text);

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
      dimensions: embeddingDimensions,
    });
    return response.data[0]?.embedding ?? localEmbedding(text);
  } catch (error) {
    console.warn('[playbooks] OpenAI embeddings unavailable, using local fallback', error);
    return localEmbedding(text);
  }
}

function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  return dot / ((Math.sqrt(leftNorm) || 1) * (Math.sqrt(rightNorm) || 1));
}

export async function indexPlaybookDocument(input: {
  organizationId: string;
  ownerUserId?: string;
  name: string;
  fileType: string;
  content: string;
  metadata?: Record<string, unknown>;
  category?: string;
}) {
  const contentHash = sha256(input.content);
  const document = await prisma.playbookDocument.create({
    data: {
      organizationId: input.organizationId,
      ownerUserId: input.ownerUserId,
      name: input.name,
      fileType: input.fileType,
      status: 'INDEXING',
      contentHash,
      metadata: input.metadata as Prisma.InputJsonValue,
    },
  });

  try {
    const chunks = chunkPlaybookContent(input.content);
    for (const [index, content] of chunks.entries()) {
      const embedding = await embedText(content);
      await prisma.playbookChunk.create({
        data: {
          organizationId: input.organizationId,
          documentId: document.id,
          chunkIndex: index,
          content,
          sectionTitle: sectionTitleFor(content, index),
          tokenEstimate: Math.ceil(content.length / 4),
          embedding,
          metadata: {
            demo: Boolean(input.metadata?.demo),
            contentHash,
          },
        },
      });
    }

    const rules = extractPlaybookRules(input.content, input.category ?? String(input.metadata?.category ?? ''));
    for (const rule of rules) {
      await prisma.playbookRule.create({
        data: {
          organizationId: input.organizationId,
          documentId: document.id,
          category: rule.category,
          title: rule.title,
          description: rule.description,
          requiredApprovers: rule.requiredApprovers,
          requiredDepartments: rule.requiredDepartments,
          escalationChain: rule.escalationChain,
          spendingLimit: rule.spendingLimit,
          riskTriggers: rule.riskTriggers,
          evidenceRequired: rule.evidenceRequired,
          severity: rule.severity,
          sourceSection: rule.sourceSection,
          sourceExcerpt: rule.sourceExcerpt,
        },
      });
    }

    return prisma.playbookDocument.update({
      where: { id: document.id },
      data: {
        status: 'READY',
        lastIndexedAt: new Date(),
        metadata: {
          ...(input.metadata ?? {}),
          chunkCount: chunks.length,
          category: input.category ?? input.metadata?.category ?? inferCategory(input.content),
          ruleCount: rules.length,
        } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    await prisma.playbookDocument.update({
      where: { id: document.id },
      data: {
        status: 'ERROR',
        metadata: {
          ...(input.metadata ?? {}),
          error: error instanceof Error ? error.message : 'indexing_failed',
        } as Prisma.InputJsonValue,
      },
    });
    throw error;
  }
}

function approvalAmount(approval: Pick<ApprovalRecord, 'subject' | 'businessImpact' | 'evidenceSnippet' | 'reasoning'>) {
  return amountThreshold([approval.subject, approval.businessImpact, approval.evidenceSnippet, approval.reasoning].filter(Boolean).join(' '));
}

function ruleAppliesToApproval(rule: PlaybookRule, approval: Pick<ApprovalRecord, 'subject' | 'department' | 'category' | 'businessImpact' | 'evidenceSnippet' | 'reasoning'>) {
  const combined = [approval.subject, approval.department, approval.category, approval.businessImpact, approval.evidenceSnippet, approval.reasoning].filter(Boolean).join(' ').toLowerCase();
  const amount = approvalAmount(approval);
  const categoryMatch = [approval.department, approval.category].filter(Boolean).some((item) => item?.toLowerCase() === rule.category.toLowerCase());
  const keywordMatch = [rule.category, ...rule.requiredDepartments, ...rule.riskTriggers].some((item) => combined.includes(item.toLowerCase()));
  const thresholdMatch = rule.spendingLimit ? Boolean(amount && amount >= rule.spendingLimit) : false;
  return categoryMatch || keywordMatch || thresholdMatch;
}

function approverPresent(required: string, approval: Pick<ApprovalRecord, 'approverName' | 'approverEmail' | 'department' | 'category' | 'reasoning' | 'evidenceSnippet'>) {
  const combined = [approval.approverName, approval.approverEmail, approval.department, approval.category, approval.reasoning, approval.evidenceSnippet].filter(Boolean).join(' ').toLowerCase();
  return combined.includes(required.toLowerCase());
}

function evidencePresent(required: string, approval: Pick<ApprovalRecord, 'evidenceSnippet' | 'sourceLink' | 'reasoning' | 'conditions'>) {
  const combined = [approval.evidenceSnippet, approval.sourceLink, approval.reasoning, approval.conditions].filter(Boolean).join(' ').toLowerCase();
  if (required === 'Source message link') return Boolean(approval.sourceLink);
  return combined.includes(required.toLowerCase().split(' ')[0]);
}

export async function evaluateApprovalCompliance(organizationId: string, approvalId: string) {
  const approval = await prisma.approvalRecord.findFirst({
    where: { id: approvalId, organizationId },
  });
  if (!approval) return null;

  const rules = await prisma.playbookRule.findMany({
    where: { organizationId },
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
  const applicable = rules.filter((rule) => ruleAppliesToApproval(rule, approval));
  const rule = applicable[0] ?? rules[0] ?? null;

  const missingApprovers = rule ? rule.requiredApprovers.filter((item) => !approverPresent(item, approval)) : [];
  const missingDepartments = rule ? rule.requiredDepartments.filter((item) => !approverPresent(item, approval)) : [];
  const missingEscalationSteps = rule ? rule.escalationChain.filter((item) => !approverPresent(item, approval)) : [];
  const missingEvidence = rule ? rule.evidenceRequired.filter((item) => !evidencePresent(item, approval)) : [];
  if (!approval.sourceLink) missingEvidence.push('Source link');
  if (!approval.evidenceSnippet) missingEvidence.push('Evidence snippet');

  let score = 100;
  score -= missingApprovers.length * 18;
  score -= missingDepartments.length * 12;
  score -= missingEscalationSteps.length * 10;
  score -= missingEvidence.length * 8;
  if (approval.riskLevel === 'high') score -= 8;
  if (approval.riskLevel === 'critical') score -= 15;
  if (approval.status === 'PENDING_REVIEW') score -= 10;
  if (approval.approvalType === 'CONDITIONAL') score -= 8;
  score = Math.max(0, Math.min(100, score));

  const status = score >= 85 ? 'Compliant' : score >= 60 ? 'Partially Compliant' : 'Non-Compliant';
  const severity = score < 60 ? 'high' : score < 85 ? 'medium' : 'low';
  const explanation = rule
    ? `${status}: evaluated against "${rule.title}". ${missingApprovers.length ? `Missing approvers: ${missingApprovers.join(', ')}. ` : ''}${missingEvidence.length ? `Missing evidence: ${missingEvidence.join(', ')}.` : 'Required approvers and evidence are present.'}`
    : `${status}: no playbook rule matched yet. Upload policy playbooks for stronger evaluation.`;

  await prisma.approvalComplianceEvaluation.deleteMany({ where: { organizationId, approvalRecordId: approval.id } });
  const evaluation = await prisma.approvalComplianceEvaluation.create({
    data: {
      organizationId,
      approvalRecordId: approval.id,
      ruleId: rule?.id,
      status,
      score,
      severity,
      missingApprovers,
      missingDepartments,
      missingEscalationSteps,
      missingEvidence: [...new Set(missingEvidence)],
      triggeredRule: rule?.title,
      explanation,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId,
      approvalRecordId: approval.id,
      action: 'playbook.compliance.evaluated',
      metadata: {
        evaluationId: evaluation.id,
        status,
        score,
        ruleId: rule?.id,
        missingApprovers,
        missingEvidence,
      } as Prisma.InputJsonValue,
    },
  });

  return evaluation;
}

export async function evaluateRecentApprovals(organizationId: string, limit = 50) {
  const approvals = await prisma.approvalRecord.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true },
  });
  const results = [];
  for (const approval of approvals) {
    const result = await evaluateApprovalCompliance(organizationId, approval.id);
    if (result) results.push(result);
  }
  return results;
}

export async function getPlaybookComplianceInsights(organizationId: string) {
  const [ruleCount, evaluationCount, evaluations, violationsByRule, violationsByDepartment] = await Promise.all([
    prisma.playbookRule.count({ where: { organizationId } }),
    prisma.approvalComplianceEvaluation.count({ where: { organizationId } }),
    prisma.approvalComplianceEvaluation.findMany({
      where: { organizationId },
      include: { approvalRecord: true, rule: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.approvalComplianceEvaluation.groupBy({
      by: ['triggeredRule'],
      where: { organizationId, status: { not: 'Compliant' } },
      _count: { _all: true },
      orderBy: { _count: { triggeredRule: 'desc' } },
      take: 6,
    }),
    prisma.approvalComplianceEvaluation.groupBy({
      by: ['severity'],
      where: { organizationId },
      _count: { _all: true },
    }),
  ]);

  const compliant = evaluations.filter((item) => item.status === 'Compliant').length;
  const partial = evaluations.filter((item) => item.status === 'Partially Compliant').length;
  const nonCompliant = evaluations.filter((item) => item.status === 'Non-Compliant').length;
  const averageScore = evaluations.length ? Math.round(evaluations.reduce((sum, item) => sum + item.score, 0) / evaluations.length) : 0;
  const departmentMap = new Map<string, number>();
  for (const evaluation of evaluations.filter((item) => item.status !== 'Compliant')) {
    const key = evaluation.approvalRecord.department ?? 'Unassigned';
    departmentMap.set(key, (departmentMap.get(key) ?? 0) + 1);
  }

  return {
    ruleCount,
    evaluationCount,
    averageScore,
    compliant,
    partial,
    nonCompliant,
    mostViolatedPolicies: violationsByRule.map((item) => ({ name: item.triggeredRule ?? 'Unmatched rule', count: item._count._all })),
    departmentsWithHighestViolations: [...departmentMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    riskTrend: violationsByDepartment.map((item) => ({ name: item.severity, count: item._count._all })),
    recentEvaluations: evaluations,
  };
}

export async function searchPlaybookChunks(organizationId: string, question: string, limit = 5): Promise<SourceMatch[]> {
  const queryEmbedding = await embedText(question);
  const chunks = await prisma.playbookChunk.findMany({
    where: {
      organizationId,
      document: { status: 'READY' },
    },
    include: { document: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return chunks
    .map((chunk) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      documentName: chunk.document.name,
      sectionTitle: chunk.sectionTitle ?? `Section ${chunk.chunkIndex + 1}`,
      content: chunk.content,
      score: cosineSimilarity(queryEmbedding, Array.isArray(chunk.embedding) ? chunk.embedding.map(Number) : []),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function inferGuidance(question: string, sources: SourceMatch[]): PlaybookAnswer {
  const combined = `${question}\n${sources.map((source) => source.content).join('\n')}`.toLowerCase();
  const departments = new Set<string>();
  const approvers = new Set<string>();
  const missing = new Set<string>();

  if (/\b(contract|vendor|procurement|purchase|supplier|po)\b/.test(combined)) {
    departments.add('Procurement');
    approvers.add('Procurement approval');
    missing.add('Vendor risk review evidence');
  }
  if (/\b(contract|msa|terms|legal|signature|liability)\b/.test(combined)) {
    departments.add('Legal');
    approvers.add('Legal approval');
    missing.add('Final contract redlines or legal sign-off');
  }
  if (/\b(\$|budget|spend|payment|invoice|finance|amount|cost)\b/.test(combined)) {
    departments.add('Finance');
    approvers.add('Finance approval');
    missing.add('Budget owner approval and spend amount');
  }
  if (/\b(security|soc 2|data|access|pii|gdpr|compliance|risk)\b/.test(combined)) {
    departments.add('Security');
    departments.add('Compliance');
    approvers.add('Security or Compliance approval');
    missing.add('Security/compliance evidence packet');
  }
  if (/\b(employee|candidate|offer|compensation|hr)\b/.test(combined)) {
    departments.add('HR');
    approvers.add('HR approval');
    missing.add('People team approval trail');
  }

  if (approvers.size === 0) approvers.add('Manager approval');
  if (departments.size === 0) departments.add('Business owner');

  const confidence = Math.max(72, Math.min(96, Math.round(78 + (sources[0]?.score ?? 0) * 18 + sources.length * 2)));
  const compliant = sources.length === 0 ? 'needs_review' : missing.size > 0 ? 'needs_review' : 'yes';

  return {
    answer: `${Array.from(approvers).join(', ')} required. ${sources[0] ? `Most relevant policy source is ${sources[0].documentName}, ${sources[0].sectionTitle}.` : 'Upload a playbook to improve source-backed guidance.'}`,
    requiredApprovers: Array.from(approvers),
    requiredDepartments: Array.from(departments),
    policySections: sources.map((source) => ({
      document: source.documentName,
      section: source.sectionTitle,
      excerpt: source.content.slice(0, 320),
    })),
    evidenceMissing: Array.from(missing),
    compliant,
    confidence,
  };
}

async function answerWithOpenAI(question: string, sources: SourceMatch[]) {
  if (!env.OPENAI_API_KEY) return null;
  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are ApprovLine Playbook AI. Answer approval governance questions using only provided policy sources. Return JSON with answer, requiredApprovers, requiredDepartments, policySections, evidenceMissing, compliant, confidence.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            question,
            sources: sources.map((source) => ({
              document: source.documentName,
              section: source.sectionTitle,
              excerpt: source.content.slice(0, 1400),
              score: source.score,
            })),
          }),
        },
      ],
      temperature: 0.1,
    });
    const raw = response.choices[0]?.message.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlaybookAnswer>;
    return {
      answer: String(parsed.answer ?? ''),
      requiredApprovers: Array.isArray(parsed.requiredApprovers) ? parsed.requiredApprovers.map(String) : [],
      requiredDepartments: Array.isArray(parsed.requiredDepartments) ? parsed.requiredDepartments.map(String) : [],
      policySections: Array.isArray(parsed.policySections) ? parsed.policySections as PlaybookAnswer['policySections'] : [],
      evidenceMissing: Array.isArray(parsed.evidenceMissing) ? parsed.evidenceMissing.map(String) : [],
      compliant: parsed.compliant === 'yes' || parsed.compliant === 'no' ? parsed.compliant : 'needs_review',
      confidence: Math.max(1, Math.min(99, Number(parsed.confidence ?? 85))),
    } satisfies PlaybookAnswer;
  } catch (error) {
    console.warn('[playbooks] OpenAI answer generation unavailable, using rules fallback', error);
    return null;
  }
}

export async function queryPlaybooks(input: { organizationId: string; actorUserId?: string; question: string }) {
  const sources = await searchPlaybookChunks(input.organizationId, input.question);
  const aiAnswer = await answerWithOpenAI(input.question, sources);
  const answer = aiAnswer ?? inferGuidance(input.question, sources);
  const stored = await prisma.playbookQuery.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      question: input.question,
      answer: answer as unknown as Prisma.InputJsonValue,
      sourceChunkIds: sources.map((source) => source.chunkId),
      confidence: answer.confidence,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'playbook.query.answered',
      metadata: {
        question: input.question,
        queryId: stored.id,
        confidence: answer.confidence,
        sourceChunkIds: sources.map((source) => source.chunkId),
      },
    },
  });

  return { queryId: stored.id, ...answer };
}

export async function seedDemoPlaybooks(organizationId: string, ownerUserId?: string) {
  const existing = await prisma.playbookDocument.count({
    where: {
      organizationId,
      metadata: {
        path: ['demo'],
        equals: true,
      },
    },
  });
  if (existing > 0) return { created: 0 };

  const samples = [
    {
      name: 'Demo Vendor Procurement Policy.md',
      fileType: 'md',
      content: `# Vendor Procurement Policy

## Section 4.2 Vendor contracts above $25,000
Vendor contracts above $25,000 require Procurement approval, Legal approval, and Finance approval before signature. Security review is required when vendor access includes customer data, production systems, SOC 2 evidence, or subprocessors.

## Section 5.1 Required evidence
Required evidence includes vendor risk review, budget owner approval, final contract redlines, procurement intake form, and payment terms.`,
    },
    {
      name: 'Demo Legal Approval Playbook.md',
      fileType: 'md',
      content: `# Legal Approval Playbook

## Section 2.1 Contract sign-off
Legal owns approval for customer contracts, vendor agreements, data processing terms, liability changes, indemnity, and non-standard payment terms. Legal approval must cite the final redline version.

## Section 3.4 Missing evidence
If final redlines, counterparty name, contract amount, or signature authority are missing, the approval is not complete and should be routed for review.`,
    },
    {
      name: 'Demo Finance Approval Matrix.md',
      fileType: 'md',
      content: `# Finance Approval Matrix

## Section 1.3 Spend thresholds
Budget increases above $10,000 require department manager approval. Spend above $25,000 requires Finance approval. Spend above $50,000 requires Finance leadership approval and procurement evidence.

## Section 1.5 Budget evidence
Approvals must include amount, cost center, business justification, and budget owner.`,
    },
  ];

  for (const sample of samples) {
    await indexPlaybookDocument({
      organizationId,
      ownerUserId,
      name: sample.name,
      fileType: sample.fileType,
      content: sample.content,
      metadata: { demo: true, source: 'ApprovLine demo mode' },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId: ownerUserId,
      action: 'playbook.demo.seeded',
      metadata: { demo: true, documents: samples.map((sample) => sample.name) },
    },
  });

  return { created: samples.length };
}
