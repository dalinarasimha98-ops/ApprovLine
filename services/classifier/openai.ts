import { z } from 'zod';
import { createHash } from 'crypto';
import { env } from '@/config/env';
import type { ClassifyRequest, ClassifyResponse } from '@/types/classifier';
import {
  approvalClassifierSystemPrompt,
  approvalClassifierUserPrompt,
  CLASSIFIER_PROMPT_VERSION,
} from '@/services/classifier/prompts';
import type { ApprovalCategory, RiskLevel } from '@/types/classifier';
import { generateText } from '@/services/ai/gateway';
import { DEFAULT_ANTHROPIC_MODEL } from '@/services/ai/providers/anthropicGeneration';
import { OPENAI_MODEL } from '@/services/ai/providers/openaiGeneration';

const classifierSchema = z.object({
  approval_detected: z.boolean(),
  approval_type: z.enum(['explicit', 'implicit', 'conditional', 'rejection', 'escalation', 'not_approval']),
  confidence: z.number().int().min(0).max(100),
  approver: z.string().nullable(),
  approver_name: z.string().nullable().optional(),
  approver_email: z.string().email().nullable().optional(),
  approval_timestamp: z.string().nullable().optional(),
  source_platform: z.string().nullable().optional(),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  business_impact: z.string().optional(),
  category: z.enum(['Finance', 'Procurement', 'Legal', 'HR', 'Engineering', 'Security', 'Compliance']).nullable().optional(),
  subject: z.string().min(1),
  department: z.string().nullable(),
  reasoning: z.string().min(1),
  conditions: z.string().nullable(),
});

const CLASSIFIER_MAX_TOKENS = 800;

export const CLASSIFIER_MODEL = env.ANTHROPIC_API_KEY
  ? env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL
  : OPENAI_MODEL;

export function hashClassifierInput(input: ClassifyRequest) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function readMetadataString(metadata: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function extractNameFromEmail(email: string | null) {
  if (!email) return null;
  const local = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  return local ? local.replace(/\b\w/g, (char) => char.toUpperCase()) : null;
}

function inferApproverIdentity(input: ClassifyRequest, result: z.infer<typeof classifierSchema>) {
  const metadata = input.metadata;
  const approverEmail =
    result.approver_email ??
    input.sender_email ??
    input.senderEmail ??
    readMetadataString(metadata, ['approver_email', 'sender_email', 'email', 'from_email', 'user_email']);
  const approverName =
    result.approver_name ??
    result.approver ??
    input.sender ??
    input.slack_user ??
    input.teams_user ??
    input.zoom_participant ??
    readMetadataString(metadata, ['approver_name', 'sender_name', 'user_name', 'display_name', 'from_name']) ??
    extractNameFromEmail(approverEmail);

  return {
    approver_name: approverName,
    approver_email: approverEmail,
  };
}

function inferSourcePlatform(input: ClassifyRequest, result: z.infer<typeof classifierSchema>) {
  return result.source_platform ?? input.source ?? readMetadataString(input.metadata, ['source', 'platform', 'provider']);
}

function inferApprovalTimestamp(input: ClassifyRequest, result: z.infer<typeof classifierSchema>) {
  const value =
    result.approval_timestamp ??
    input.timestamp ??
    readMetadataString(input.metadata, ['timestamp', 'approval_timestamp', 'created_at', 'event_time', 'message_ts']);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function inferCategory(input: ClassifyRequest, result: z.infer<typeof classifierSchema>): ApprovalCategory | null {
  if (result.category) return result.category;
  const text = `${input.message} ${result.subject} ${result.department ?? ''}`.toLowerCase();
  if (/\b(budget|invoice|expense|payment|forecast|revenue|finance|spend|cost)\b/.test(text)) return 'Finance';
  if (/\b(vendor|purchase|procurement|po|supplier|rfp|contractor)\b/.test(text)) return 'Procurement';
  if (/\b(contract|legal|terms|msa|dpa|liability|counsel)\b/.test(text)) return 'Legal';
  if (/\b(hiring|offer|compensation|employee|hr|policy|leave)\b/.test(text)) return 'HR';
  if (/\b(deploy|release|sprint|architecture|engineering|migration|api)\b/.test(text)) return 'Engineering';
  if (/\b(security|access|permission|sso|soc|vulnerability|incident|encryption)\b/.test(text)) return 'Security';
  if (/\b(audit|compliance|gdpr|hipaa|sox|retention|regulatory)\b/.test(text)) return 'Compliance';
  return null;
}

function inferRiskLevel(input: ClassifyRequest, result: z.infer<typeof classifierSchema>, category: ApprovalCategory | null): RiskLevel {
  if (result.risk_level) return result.risk_level;
  const text = `${input.message} ${result.subject}`.toLowerCase();
  const amount = text.match(/\$?\s?([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)(k|m|million|thousand)?/i);
  const numericAmount = amount
    ? Number(amount[1].replace(/,/g, '')) * (amount[2]?.toLowerCase().startsWith('m') ? 1_000_000 : amount[2]?.toLowerCase().startsWith('k') ? 1_000 : 1)
    : 0;
  if (/\b(production outage|breach|critical|regulatory filing|lawsuit|terminate)\b/.test(text) || numericAmount >= 1_000_000) return 'critical';
  if (['Legal', 'Security', 'Compliance'].includes(category ?? '') || numericAmount >= 100_000) return 'high';
  if (numericAmount >= 10_000 || result.approval_type === 'conditional' || result.approval_type === 'escalation') return 'medium';
  return 'low';
}

function scoreConfidence(input: ClassifyRequest, result: z.infer<typeof classifierSchema>, approverName: string | null, approverEmail: string | null) {
  let score = result.confidence;
  if (result.approval_type === 'explicit') score += 3;
  if (result.approval_type === 'conditional') score += 1;
  if (approverName) score += 4;
  if (approverEmail) score += 4;
  if (input.source) score += 2;
  if (input.timestamp || result.approval_timestamp) score += 2;
  if (!approverName && !approverEmail) score -= 8;
  if (result.approval_type === 'not_approval') score = Math.min(score, 90);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeClassifierResult(input: ClassifyRequest, result: z.infer<typeof classifierSchema>): ClassifyResponse {
  const identity = inferApproverIdentity(input, result);
  const category = inferCategory(input, result);
  const riskLevel = inferRiskLevel(input, result, category);
  const approvalTimestamp = inferApprovalTimestamp(input, result);
  return {
    approval_detected: result.approval_detected,
    approval_type: result.approval_type,
    confidence: scoreConfidence(input, result, identity.approver_name, identity.approver_email),
    approver: identity.approver_name,
    approver_name: identity.approver_name,
    approver_email: identity.approver_email,
    approval_timestamp: approvalTimestamp,
    source_platform: inferSourcePlatform(input, result),
    risk_level: riskLevel,
    business_impact: result.business_impact ?? 'Business decision captured for audit review.',
    category,
    subject: result.subject,
    department: result.department ?? category,
    reasoning: result.reasoning,
    conditions: result.conditions,
  };
}

function parseClassifierJson(content: string) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  return classifierSchema.parse(JSON.parse(cleaned));
}

export async function classifyWithOpenAI(input: ClassifyRequest): Promise<ClassifyResponse> {
  const result = await generateText({
    system: approvalClassifierSystemPrompt(),
    user: approvalClassifierUserPrompt(input),
    maxTokens: CLASSIFIER_MAX_TOKENS,
  });
  return normalizeClassifierResult(input, parseClassifierJson(result.text));
}

export { CLASSIFIER_PROMPT_VERSION };
