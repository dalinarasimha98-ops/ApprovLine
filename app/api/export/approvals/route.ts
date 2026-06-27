import { NextResponse } from 'next/server';
import { getCurrentTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const { organization } = await getCurrentTenant();
  const approvals = await prisma.approvalRecord.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: 'desc' },
  });
  const header = ['Subject', 'Approver', 'Department', 'Type', 'Status', 'Confidence', 'Created At'];
  const rows = approvals.map((item) => [
    item.subject,
    item.approverName ?? '',
    item.department ?? '',
    item.approvalType,
    item.status,
    String(item.confidence),
    item.createdAt.toISOString(),
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
    .join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="approvline-approvals.csv"',
    },
  });
}
