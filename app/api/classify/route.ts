import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApprovalType, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { classifyWithOpenAI, CLASSIFIER_MODEL, CLASSIFIER_PROMPT_VERSION, hashClassifierInput } from '@/services/classifier/openai';
import { writeAuditLog } from '@/services/audit';

const classifyRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  source: z.string().optional(),
  channel: z.string().optional(),
  sender: z.string().optional(),
  organizationId: z.string().optional(),
});

function toPrismaApprovalType(type: string): ApprovalType {
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

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limit = rateLimit(`classify:${ip}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const parsed = classifyRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await classifyWithOpenAI(parsed.data);
    const organizationId = parsed.data.organizationId;

    if (organizationId) {
      const classifier = await prisma.classifierResult.create({
        data: {
          organizationId,
          model: CLASSIFIER_MODEL,
          promptVersion: CLASSIFIER_PROMPT_VERSION,
          inputHash: hashClassifierInput(parsed.data),
          approvalDetected: result.approval_detected,
          approvalType: toPrismaApprovalType(result.approval_type),
          confidence: result.confidence,
          normalizedJson: result as unknown as Prisma.InputJsonValue,
        },
      });

      if (result.approval_detected) {
        const approval = await prisma.approvalRecord.create({
          data: {
            organizationId,
            subject: result.subject,
            department: result.department,
            approverName: result.approver,
            approvalType: toPrismaApprovalType(result.approval_type),
            status: result.approval_type === 'not_approval' ? 'NOT_A_DECISION' : 'APPROVED',
            confidence: result.confidence,
            reasoning: result.reasoning,
            conditions: result.conditions,
            evidenceSnippet: parsed.data.message.slice(0, 1000),
            classifierResults: { connect: { id: classifier.id } },
          },
        });

        await writeAuditLog({
          organizationId,
          approvalRecordId: approval.id,
          action: 'approval_record.created',
          ipAddress: ip,
          userAgent: request.headers.get('user-agent') ?? undefined,
        });
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Classification failed' },
      { status: 500 },
    );
  }
}
