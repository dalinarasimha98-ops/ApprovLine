import { ApprovalStatus, ApprovalType, IntegrationProvider, type Prisma } from '@prisma/client';
import { env } from '@/config/env';
import { invalidateApprovalRecordsCache } from '@/lib/approvalRecords';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/services/audit';
import { CLASSIFIER_MODEL, CLASSIFIER_PROMPT_VERSION, hashClassifierInput } from '@/services/classifier/openai';
import { completeIdempotencyRecord, failIdempotencyRecord } from '@/services/queue/reliability';
import type { ClassifyRequest, ClassifyResponse } from '@/types/classifier';

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

function toIntegrationProvider(source?: string | null): IntegrationProvider | null {
  const normalized = source?.toLowerCase().replace(/[^a-z]/g, '');
  const map: Record<string, IntegrationProvider> = {
    slack: 'SLACK',
    gmail: 'GMAIL',
    email: 'GMAIL',
    googlemail: 'GMAIL',
    outlook: 'OUTLOOK',
    exchange: 'OUTLOOK',
    microsoftoutlook: 'OUTLOOK',
    exchangeonline: 'OUTLOOK',
    teams: 'MICROSOFT_TEAMS',
    microsoftteams: 'MICROSOFT_TEAMS',
    jira: 'JIRA',
    atlassianjira: 'JIRA',
    servicenow: 'SERVICENOW',
    servicecatalog: 'SERVICENOW',
    cabapproval: 'SERVICENOW',
    zoom: 'ZOOM',
  };
  return normalized ? map[normalized] ?? null : null;
}

async function resolveStorageOrganization(organizationId?: string) {
  if (organizationId) return organizationId;
  if (!env.DATABASE_URL) return null;

  const organization = await prisma.organization.upsert({
    where: { slug: 'public-demo' },
    update: {},
    create: {
      name: 'Public Demo',
      slug: 'public-demo',
      departments: [],
      approvalCategories: [],
      onboardingCompletedSteps: [],
    },
  });
  return organization.id;
}

export async function persistClassificationResult(input: {
  organizationId?: string;
  messageSourceId?: string;
  integrationId?: string;
  request: ClassifyRequest;
  result: ClassifyResponse;
  ipAddress?: string;
  userAgent?: string;
  sourceLink?: string;
  auditAction?: string;
  sourceSystem?: string;
  sourceRecordId?: string;
  contentHash?: string;
  correlationId?: string;
  idempotencyKey?: string;
}) {
  const organizationId = await resolveStorageOrganization(input.organizationId);
  if (!organizationId) return null;

  // Organization Settings > Approval Settings policy - a real gate on what
  // gets PERSISTED for new records, never on whether classification/
  // evidence capture runs at all (the classifier call and MessageSource/
  // CanonicalEvidenceEvent capture happen upstream in
  // services/ingestion/processIncomingMessage.ts and are never skipped -
  // disabling a policy here only means the derived field is withheld from
  // the record, not that the message goes uncaptured or unaudited).
  // Existing records are never touched.
  const policy = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { autoCategorizationEnabled: true, riskDetectionEnabled: true, defaultDueDateDays: true, defaultRiskLevel: true },
  }).catch(() => null);
  const autoCategorizationEnabled = policy?.autoCategorizationEnabled ?? true;
  const riskDetectionEnabled = policy?.riskDetectionEnabled ?? true;
  const defaultDueDateDays = policy?.defaultDueDateDays ?? null;
  // When risk detection is off, Default Risk Level is what's actually
  // stored instead - not always null - so an org can say "skip AI risk
  // scoring, but still flag everything as at least Medium" rather than
  // losing risk triage entirely.
  const defaultRiskLevel = policy?.defaultRiskLevel ?? null;

  const sourcePlatform = input.result.source_platform ?? input.request.source;
  const provider = toIntegrationProvider(sourcePlatform);
  const inputHash = hashClassifierInput(input.request);

  try {
    const existingClassifier =
      input.idempotencyKey
        ? await prisma.classifierResult.findUnique({
            where: {
              organizationId_idempotencyKey: {
                organizationId,
                idempotencyKey: input.idempotencyKey,
              },
            },
            include: { approvalRecord: true },
          }).catch(() => null)
        : null;

    if (existingClassifier) {
      return { classifier: existingClassifier, approval: existingClassifier.approvalRecord };
    }

    const messageSourceId =
      input.messageSourceId ??
      (provider
        ? (
            await prisma.messageSource.create({
              data: {
                organizationId,
                integrationId: input.integrationId,
                provider,
                channel: input.request.channel,
                sender: input.result.approver_name ?? input.request.sender,
                senderEmail: input.result.approver_email ?? input.request.sender_email ?? input.request.senderEmail,
                contentHash: input.contentHash,
                correlationId: input.correlationId,
                idempotencyKey: input.idempotencyKey,
                rawPayload: {
                  metadata: input.request.metadata ?? {},
                  sourcePlatform,
                } as Prisma.InputJsonValue,
              },
            })
          ).id
        : undefined);

    const approvalType = toApprovalType(input.result.approval_type);
    const classifier = await prisma.classifierResult.create({
      data: {
        organizationId,
        messageSourceId,
        model: CLASSIFIER_MODEL,
        promptVersion: CLASSIFIER_PROMPT_VERSION,
        inputHash,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        sourceSystem: input.sourceSystem,
        sourceRecordId: input.sourceRecordId,
        duplicateDisposition: 'PRIMARY',
        approvalDetected: input.result.approval_detected,
        approvalType,
        confidence: input.result.confidence,
        normalizedJson: input.result as unknown as Prisma.InputJsonValue,
      },
    });

    if (!input.result.approval_detected) {
      if (input.idempotencyKey) {
        await completeIdempotencyRecord({
          organizationId,
          key: input.idempotencyKey,
          resourceType: 'classifier_result',
          resourceId: classifier.id,
          metadata: {
            approvalDetected: false,
            sourcePlatform,
          },
        });
      }
      await writeAuditLog({
        organizationId,
        action: input.auditAction ?? 'classifier_result.created',
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: {
          classifierResultId: classifier.id,
          approvalDetected: false,
          sourcePlatform,
        },
      });
      return { classifier, approval: null };
    }

    const approval = await prisma.approvalRecord.create({
      data: {
        organizationId,
        messageSourceId,
        subject: input.result.subject,
        department: input.result.department,
        category: autoCategorizationEnabled ? input.result.category : null,
        approverName: input.result.approver_name,
        approverEmail: input.result.approver_email,
        approvalType,
        status: toApprovalStatus(input.result.approval_type),
        confidence: input.result.confidence,
        riskLevel: riskDetectionEnabled ? input.result.risk_level : defaultRiskLevel,
        businessImpact: input.result.business_impact,
        reasoning: input.result.reasoning,
        conditions: input.result.conditions,
        sourcePlatform,
        sourceLink: input.sourceLink,
        evidenceSnippet: input.request.message.slice(0, 1000),
        duplicateDisposition: 'PRIMARY',
        sourceSystem: input.sourceSystem,
        sourceRecordId: input.sourceRecordId,
        contentHash: input.contentHash,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        approvalTimestamp: input.result.approval_timestamp ? new Date(input.result.approval_timestamp) : undefined,
        occurredAt: input.result.approval_timestamp ? new Date(input.result.approval_timestamp) : undefined,
        // The classifier never produces its own due date - this is the only
        // source for ApprovalRecord.dueDate today. Organization Settings >
        // Approval Settings > Default Due Date.
        dueDate: defaultDueDateDays ? new Date(Date.now() + defaultDueDateDays * 24 * 60 * 60 * 1000) : undefined,
      },
    });

    await prisma.classifierResult.update({
      where: { id: classifier.id },
      data: { approvalRecordId: approval.id },
    });

    if (input.idempotencyKey) {
      await completeIdempotencyRecord({
        organizationId,
        key: input.idempotencyKey,
        resourceType: 'approval_record',
        resourceId: approval.id,
        metadata: {
          classifierResultId: classifier.id,
          sourcePlatform,
        },
      });
    }

    await writeAuditLog({
      organizationId,
      approvalRecordId: approval.id,
      action: input.auditAction ?? 'approval_record.created',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        classifierResultId: classifier.id,
        approvalType: input.result.approval_type,
        // What was actually PERSISTED (post-policy), not the raw
        // classifier output - if auto-categorization/risk detection was
        // disabled for this org, the audit trail must say so honestly
        // rather than implying a value was recorded that wasn't.
        riskLevel: approval.riskLevel,
        category: approval.category,
        sourcePlatform,
      },
    });

    invalidateApprovalRecordsCache(organizationId);
    return { classifier, approval };
  } catch (error) {
    if (input.idempotencyKey) {
      await failIdempotencyRecord({
        organizationId,
        key: input.idempotencyKey,
        failureReason: error instanceof Error ? error.message : 'Classifier persistence failed',
        metadata: {
          sourceSystem: input.sourceSystem,
          sourceRecordId: input.sourceRecordId,
        },
      }).catch(() => null);
    }
    throw error;
  }
}
