import { NextRequest, NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { getComplianceIssues, createComplianceIssue, updateComplianceIssueStatus } from '@/services/compliance';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenant = await getDashboardTenant();
  if (!tenant.user || !tenant.organization) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'AUDITOR', 'OWNER', 'MANAGER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const severity = req.nextUrl.searchParams.get('severity') ?? undefined;
  const frameworkId = req.nextUrl.searchParams.get('frameworkId') ?? undefined;

  const issues = await getComplianceIssues(tenant.organization.id, { status, severity, frameworkId });
  return NextResponse.json({ issues });
}

const CreateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  frameworkId: z.string().optional(),
  controlId: z.string().optional(),
  owner: z.string().max(200).optional(),
  dueDate: z.string().datetime().optional(),
  approvalRecordId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const tenant = await getDashboardTenant();
  if (!tenant.user || !tenant.organization) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'OWNER', 'MANAGER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const issue = await createComplianceIssue(
    { organizationId: tenant.organization.id, userId: tenant.user.id },
    {
      ...parsed.data,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
    },
  );

  return NextResponse.json(issue, { status: 201 });
}

const PatchSchema = z.object({
  issueId: z.string().min(1),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED', 'DEFERRED']),
});

export async function PATCH(req: NextRequest) {
  const tenant = await getDashboardTenant();
  if (!tenant.user || !tenant.organization) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'OWNER', 'MANAGER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  await updateComplianceIssueStatus(
    { organizationId: tenant.organization.id, userId: tenant.user.id },
    parsed.data.issueId,
    parsed.data.status,
  );

  return NextResponse.json({ ok: true });
}
