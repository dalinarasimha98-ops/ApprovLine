import { Worker } from 'bullmq';
import { ApprovalStatus, ApprovalType, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { classifyWithOpenAI, CLASSIFIER_MODEL, CLASSIFIER_PROMPT_VERSION, hashClassifierInput } from '@/services/classifier/openai';
import { createRedisConnection } from '@/services/queue/connection';
import type { IncomingMessageJob } from '@/services/queue/approvalQueue';
import { writeAuditLog } from '@/services/audit';

function toApprovalType(type: string): ApprovalType {
  const map: Record<string, ApprovalType> = {
    explicit: 'EXPLICIT',
    implicit: 'IMPLICIT',
    conditional: 'CONDITIONAL',
    rejection: 'REJECTION',
    escalation: 'ESCALATION',
    not_approval: 'NOT_APPROVAL',
  };
  return map[type] ?? 'NOT_APPROVAL';
}

function toApprovalStatus(type: string): ApprovalStatus {
  if (type === 'not_approval') return 'NOT_A_DECISION';
  if (type === 'rejection') return 'REJECTED';
  if (type === 'conditional') return 'PENDING_REVIEW';
  return 'APPROVED';
}

new Worker<IncomingMessageJob>(
  'approval-classification',
  async (job) => {
    const payload = job.data;
    const messageSource = await prisma.messageSource.create({
      data: {
        organizationId: payload.organizationId,
        integrationId: payload.integrationId,
        provider: payload.provider,
        externalId: payload.externalId,
        channel: payload.channel,
        sender: payload.sender,
        senderEmail: payload.senderEmail,
        rawPayload: payload.rawPayload as Prisma.InputJsonValue,
      },
    });

    const input = {
      message: payload.message,
      source: payload.provider,
      channel: payload.channel,
      sender: payload.sender ?? payload.senderEmail,
    };
    const startedAt = Date.now();
    const result = await classifyWithOpenAI(input);
    const approvalType = toApprovalType(result.approval_type);

    const classifier = await prisma.classifierResult.create({
      data: {
        organizationId: payload.organizationId,
        messageSourceId: messageSource.id,
        model: CLASSIFIER_MODEL,
        promptVersion: CLASSIFIER_PROMPT_VERSION,
        inputHash: hashClassifierInput(input),
        approvalDetected: result.approval_detected,
        approvalType,
        confidence: result.confidence,
        normalizedJson: result as unknown as Prisma.InputJsonValue,
        latencyMs: Date.now() - startedAt,
      },
    });

    if (!result.approval_detected) return classifier;

    const approval = await prisma.approvalRecord.create({
      data: {
        organizationId: payload.organizationId,
        messageSourceId: messageSource.id,
        subject: result.subject,
        department: result.department,
        approverName: result.approver,
        approvalType,
        status: toApprovalStatus(result.approval_type),
        confidence: result.confidence,
        reasoning: result.reasoning,
        conditions: result.conditions,
        sourceLink: payload.sourceLink,
        evidenceSnippet: payload.message.slice(0, 1000),
      },
    });

    await prisma.classifierResult.update({
      where: { id: classifier.id },
      data: { approvalRecordId: approval.id },
    });

    await writeAuditLog({
      organizationId: payload.organizationId,
      approvalRecordId: approval.id,
      action: 'approval_record.created_from_queue',
      metadata: { provider: payload.provider, jobId: job.id },
    });

    return approval;
  },
  { connection: createRedisConnection(), concurrency: 10 },
);
