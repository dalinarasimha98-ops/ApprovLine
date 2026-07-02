import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { measure } from '@/lib/performance';
import { prisma } from '@/lib/prisma';
import { syncAllOutlookIntegrations, syncOutlookIntegration } from '@/services/integrations/outlook';

async function readSyncInput(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    return {
      integrationId: form.get('integrationId'),
      maxMessages: form.get('maxMessages'),
      query: form.get('query'),
      fromForm: true,
    };
  }
  return request.json().catch(() => ({}));
}

function asString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function syncResponse(request: NextRequest, fromForm: boolean, payload: unknown, status = 200) {
  if (fromForm) {
    const url = new URL('/dashboard/settings/integrations', request.url);
    if (status >= 400) {
      url.searchParams.set('outlook', 'error');
      url.searchParams.set('reason', typeof payload === 'object' && payload && 'error' in payload ? String(payload.error) : 'outlook_sync_failed');
    } else {
      url.searchParams.set('outlook', 'synced');
    }
    return NextResponse.redirect(url);
  }
  return NextResponse.json(payload, { status });
}

export async function POST(request: NextRequest) {
  return measure('POST /api/integrations/outlook/sync', async () => {
    const tenant = await requireRole('ADMIN');
    const body = await readSyncInput(request);
    const integrationId = asString(body.integrationId);
    const syncInput = {
      maxMessages: asNumber(body.maxMessages),
      query: asString(body.query),
    };
    const fromForm = body.fromForm === true;

    if (integrationId) {
      const integration = await prisma.integration.findFirst({
        where: {
          id: integrationId,
          organizationId: tenant.organization.id,
          provider: 'OUTLOOK',
        },
      });
      if (!integration) {
        return syncResponse(request, fromForm, { error: 'Outlook integration not found' }, 404);
      }
      try {
        await prisma.integration.update({ where: { id: integration.id }, data: { status: 'SYNCING' } });
        return syncResponse(request, fromForm, {
          ok: true,
          result: await syncOutlookIntegration(integration, syncInput),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Outlook sync failed';
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
            type: 'outlook.sync.error',
            payload: { reason } as Prisma.InputJsonValue,
            failedAt: new Date(),
            failureReason: reason,
          },
        });
        return syncResponse(request, fromForm, { error: reason }, 500);
      }
    }

    const integrations = await prisma.integration.findMany({
      where: { organizationId: tenant.organization.id, provider: 'OUTLOOK', status: { in: ['CONNECTED', 'SYNCING'] } },
    });
    const results = [];
    for (const integration of integrations) {
      await prisma.integration.update({ where: { id: integration.id }, data: { status: 'SYNCING' } });
      results.push({ integrationId: integration.id, result: await syncOutlookIntegration(integration, syncInput) });
    }

    return syncResponse(request, fromForm, { ok: true, results });
  });
}

export async function GET() {
  return measure('GET /api/integrations/outlook/sync', async () => {
    await requireRole('ADMIN');
    return NextResponse.json({ ok: true, results: await syncAllOutlookIntegrations() });
  });
}
