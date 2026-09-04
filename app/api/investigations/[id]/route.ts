import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasAnyRole } from '@/lib/rbac';
import { withTimeout } from '@/lib/performance';
import { buildInvestigationSummary, buildPolicyChecks, calculateRiskScore, timelineForApproval } from '@/services/investigations';
import { EntitlementDeniedError, requireEntitlement } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

// AUDITOR has VIEW access to investigations (read-only); writes remain MANAGER+.
const READ_ROLES = ['AUDITOR', 'MANAGER', 'ADMIN', 'OWNER'] as const;
const WRITE_ROLES = ['MANAGER', 'ADMIN', 'OWNER'] as const;

const VALID_STATUSES = ['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED'] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

export async function GET(_: Request, { params }: RouteContext) {
  const { id } = await params;
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  if (!hasAnyRole(tenant.user.role, [...READ_ROLES])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    await requireEntitlement(tenant.organization.id, 'investigations');
  } catch (err) {
    if (err instanceof EntitlementDeniedError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const investigation = await withTimeout(
    'investigation detail api',
    prisma.investigationCase.findFirst({
      where: { id, organizationId: tenant.organization.id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        approvals: {
          include: {
            approvalRecord: {
              include: {
                messageSource: true,
                auditLogs: { orderBy: { createdAt: 'asc' }, take: 20 },
                complianceEvaluations: { include: { rule: true }, orderBy: { createdAt: 'desc' }, take: 3 },
                unifiedEvidenceRecords: {
                  take: 3,
                },
              },
            },
          },
        },
        notes: {
          include: { authorUser: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    }),
    2000,
  ).catch(() => null);

  if (!investigation) return NextResponse.json({ error: 'Investigation not found' }, { status: 404 });

  const approvals = investigation.approvals.map((item) => item.approvalRecord);
  const generatedSummary = buildInvestigationSummary(approvals);
  const metadata = (investigation.metadata ?? {}) as Record<string, unknown>;
  const aiSummary = (metadata.aiSummary as typeof generatedSummary | undefined) ?? generatedSummary;
  const policyChecks = (metadata.policyChecks as ReturnType<typeof buildPolicyChecks> | undefined) ?? buildPolicyChecks(approvals);
  const timeline = approvals.flatMap(timelineForApproval).sort((a, b) => a.at.getTime() - b.at.getTime());
  const riskScore = Math.max(aiSummary.riskScore, ...approvals.map(calculateRiskScore), 0);
  const complianceEvaluations = approvals.flatMap((a) => a.complianceEvaluations);

  return NextResponse.json({
    investigation,
    aiSummary,
    policyChecks,
    timeline,
    riskScore,
    complianceEvaluations,
    approvals,
  });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  if (!hasAnyRole(tenant.user.role, [...WRITE_ROLES])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    await requireEntitlement(tenant.organization.id, 'investigations');
  } catch (err) {
    if (err instanceof EntitlementDeniedError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const existing = await prisma.investigationCase.findFirst({
    where: { id, organizationId: tenant.organization.id },
    select: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: 'Investigation not found' }, { status: 404 });

  const body = await request.json().catch(() => ({})) as {
    status?: string;
    riskLevel?: string;
    department?: string;
    type?: string;
    assignedToUserId?: string | null;
    summary?: string;
  };

  const update: Prisma.InvestigationCaseUncheckedUpdateInput = {};
  const auditMeta: Record<string, unknown> = { investigationId: id };

  if (body.status && VALID_STATUSES.includes(body.status as ValidStatus)) {
    update.status = body.status as ValidStatus;
    auditMeta.fromStatus = existing.status;
    auditMeta.toStatus = body.status;
    if (body.status === 'RESOLVED' || body.status === 'CLOSED') {
      update.resolvedAt = new Date();
    } else if (existing.status === 'RESOLVED' || existing.status === 'CLOSED') {
      update.resolvedAt = null;
    }
  }
  if (body.riskLevel !== undefined) {
    update.riskLevel = body.riskLevel;
    auditMeta.riskLevel = body.riskLevel;
  }
  if (body.department !== undefined) {
    update.department = body.department;
  }
  if (body.type !== undefined) {
    update.type = body.type;
    auditMeta.type = body.type;
  }
  if ('assignedToUserId' in body) {
    update.assignedToUserId = body.assignedToUserId ?? null;
    auditMeta.assignedToUserId = body.assignedToUserId;
  }
  if (body.summary !== undefined) {
    update.summary = body.summary;
  }

  const updated = await prisma.investigationCase.update({ where: { id }, data: update });

  await prisma.auditLog.create({
    data: {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: body.status ? `investigation.status_changed` : 'investigation.updated',
      metadata: auditMeta as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ investigation: updated });
}
