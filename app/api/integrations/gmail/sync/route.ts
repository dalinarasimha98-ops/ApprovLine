import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { measure } from '@/lib/performance';
import { syncAllGmailIntegrations, syncGmailIntegration } from '@/services/integrations/gmail';

async function readSyncInput(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    return {
      integrationId: form.get('integrationId'),
      maxThreads: form.get('maxThreads'),
      query: form.get('query'),
      fromForm: true,
    };
  }
  return request.json().catch(() => ({}));
}

function asString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function syncResponse(request: NextRequest, fromForm: boolean, payload: unknown, status = 200) {
  if (fromForm) {
    const url = new URL('/dashboard/settings/integrations', request.url);
    if (status >= 400) {
      url.searchParams.set('gmail', 'error');
      url.searchParams.set('reason', typeof payload === 'object' && payload && 'error' in payload ? String(payload.error) : 'gmail_sync_failed');
    } else {
      url.searchParams.set('gmail', 'connected');
    }
    return NextResponse.redirect(url);
  }
  return NextResponse.json(payload, { status });
}

export async function POST(request: NextRequest) {
  return measure('POST /api/integrations/gmail/sync', async () => {
  const tenant = await requireRole('ADMIN');
  const body = await readSyncInput(request);
  const maxThreads = Number.isFinite(Number(body.maxThreads)) ? Number(body.maxThreads) : undefined;
  const query = asString(body.query);
  const integrationId = asString(body.integrationId);
  const fromForm = body.fromForm === true;

  if (integrationId) {
    const integration = await prisma.integration.findFirst({
      where: {
        id: integrationId,
        organizationId: tenant.organization.id,
        provider: 'GMAIL',
      },
    });
    if (!integration) {
      return syncResponse(request, fromForm, { error: 'Gmail integration not found' }, 404);
    }
    try {
      await prisma.integration.update({ where: { id: integration.id }, data: { status: 'SYNCING' } });
      return syncResponse(request, fromForm, {
        ok: true,
        result: await syncGmailIntegration(integration, { maxThreads, query }),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Gmail sync failed';
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: reason.toLowerCase().includes('invalid_grant') ? 'NEEDS_REAUTH' : 'ERROR',
          metadata: {
            ...(integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {}),
            lastSyncStatus: 'error',
            lastError: reason,
            lastErrorAt: new Date().toISOString(),
          },
        },
      });
      await prisma.event.create({
        data: {
          organizationId: tenant.organization.id,
          integrationId: integration.id,
          type: 'gmail.sync.error',
          payload: { reason } as Prisma.InputJsonValue,
          failedAt: new Date(),
          failureReason: reason,
        },
      });
      return syncResponse(request, fromForm, { error: reason }, 500);
    }
  }

  const integrations = await prisma.integration.findMany({
    where: { organizationId: tenant.organization.id, provider: 'GMAIL', status: { in: ['CONNECTED', 'SYNCING'] } },
  });
  const results = [];
  for (const integration of integrations) {
    await prisma.integration.update({ where: { id: integration.id }, data: { status: 'SYNCING' } });
    results.push({ integrationId: integration.id, result: await syncGmailIntegration(integration, { maxThreads, query }) });
  }

  return syncResponse(request, fromForm, { ok: true, results });
  });
}

export async function GET() {
  return measure('GET /api/integrations/gmail/sync', async () => {
  await requireRole('ADMIN');
  return NextResponse.json({ ok: true, results: await syncAllGmailIntegrations() });
  });
}
