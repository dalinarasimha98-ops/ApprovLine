import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { buildInvestigationSummary, buildPolicyChecks, timelineForApproval } from '@/services/investigations';

export const dynamic = 'force-dynamic';

type ReportRouteProps = {
  params: Promise<{ id: string }>;
};

function escapePdfText(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)').replaceAll('\n', ' ');
}

function createSimplePdf(lines: string[]) {
  const objects: string[] = [];
  const contentLines = lines.slice(0, 52).flatMap((line, index) => {
    const y = 760 - index * 14;
    return [`BT /F1 8 Tf 42 ${y} Td (${escapePdfText(line.slice(0, 128))}) Tj ET`];
  });
  const stream = contentLines.join('\n');

  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');
  objects.push('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj');
  objects.push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
  objects.push(`5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${object}\n`;
  }
  const xrefAt = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return pdf;
}

export async function GET(_: Request, { params }: ReportRouteProps) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!tenant.organization) {
    return NextResponse.json({ error: tenant.error ?? 'Workspace unavailable.' }, { status: 503 });
  }
  const { id } = await params;
  const investigation = await prisma.investigationCase.findFirst({
    where: { id, organizationId: tenant.organization.id },
    include: {
      approvals: {
        include: {
          approvalRecord: {
            include: {
              messageSource: true,
              auditLogs: { orderBy: { createdAt: 'asc' } },
            },
          },
        },
      },
      notes: {
        include: { authorUser: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!investigation) {
    return NextResponse.json({ error: 'Investigation not found' }, { status: 404 });
  }

  const approvals = investigation.approvals.map((item) => item.approvalRecord);
  const summary = buildInvestigationSummary(approvals);
  const policyChecks = buildPolicyChecks(approvals);
  const timeline = approvals.flatMap(timelineForApproval).sort((left, right) => left.at.getTime() - right.at.getTime());
  const lines = [
    'ApprovLine Investigation Report',
    `Generated: ${new Date().toISOString()}`,
    `Case: ${investigation.title}`,
    `Status: ${investigation.status}`,
    `Risk: ${summary.riskLevel} (${summary.riskScore}/100)`,
    '',
    'Executive Summary',
    summary.whatHappened,
    `Who approved: ${summary.whoApproved}`,
    `Why risky: ${summary.whyRisky}`,
    '',
    'Policy References',
    ...summary.policyApplies.map((item) => `- ${item}`),
    '',
    'Policy Assessment',
    ...policyChecks.map((item) => `- ${item.policy}: ${item.status}. ${item.finding}`),
    '',
    'Evidence Timeline',
    ...timeline.slice(0, 12).map((item) => `- ${item.at.toISOString()} | ${item.type} | ${item.title}: ${item.body}`),
    '',
    'Approval Evidence',
    ...approvals.map((item) => `- ${item.subject} | ${item.status} | ${item.riskLevel ?? 'low'} risk | ${item.confidence}% | ${item.approverName ?? 'Unknown'}`),
    '',
    'Recommendations',
    ...(summary.evidenceMissing.length
      ? summary.evidenceMissing.map((item) => `- Resolve: ${item}`)
      : ['- Evidence appears complete. Confirm reviewer sign-off before closing.']),
    '',
    'Investigation Notes',
    ...(investigation.notes.length
      ? investigation.notes.map((note) => `- ${note.authorUser?.email ?? 'Reviewer'}: ${note.body}`)
      : ['- No reviewer notes recorded.']),
  ];

  return new NextResponse(createSimplePdf(lines), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="approvline-investigation-${investigation.id}.pdf"`,
    },
  });
}
