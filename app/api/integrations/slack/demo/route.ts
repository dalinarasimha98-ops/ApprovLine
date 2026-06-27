import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import { buildSimulationJob } from '@/services/integrations/simulation';
import { processIncomingMessage } from '@/services/ingestion/processIncomingMessage';

export async function POST(request: NextRequest) {
  const tenant = await requireRole('ADMIN');
  const job = buildSimulationJob(tenant.organization.id, {
    source_platform: 'slack',
    message: 'Approved, move forward with vendor payment after Finance confirms the invoice total.',
    sender_name: 'Priya Sharma',
    sender_email: 'priya@company.com',
    timestamp: new Date().toISOString(),
    channel: 'beta-approvals',
  });
  const result = await processIncomingMessage(job, { auditAction: 'integration.slack.demo_message_processed' });
  return NextResponse.redirect(new URL(`/dashboard/approvals?sourcePlatform=slack&approvalRecordId=${result?.approval?.id ?? ''}`, request.url));
}
