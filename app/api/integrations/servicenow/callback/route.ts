import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';
import { encryptJson } from '@/utils/encryption';
import { writeAuditLog } from '@/services/audit';
import {
  exchangeServiceNowOAuthCode,
  normalizeServiceNowInstanceUrl,
  storedServiceNowTokens,
  verifyServiceNowState,
} from '@/services/integrations/servicenow';

export const dynamic = 'force-dynamic';

function serviceNowCallbackFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : 'ServiceNow connection storage failed';
  if (
    message.includes('Invalid value for argument `provider`') ||
    message.includes('invalid input value for enum') ||
    message.includes('IntegrationProvider') ||
    message.includes('SERVICENOW')
  ) {
    return 'servicenow_database_migration_required';
  }
  return message;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');
  const errorDescription = request.nextUrl.searchParams.get('error_description');
  if (error) {
    const reason = errorDescription ?? error;
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?servicenow=error&reason=${encodeURIComponent(reason)}`, request.url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?servicenow=error&reason=missing_oauth_code_or_state', request.url));
  }

  const tenant = await getCurrentTenant();
  const statePayload = verifyServiceNowState(state);
  if (!statePayload || statePayload.organizationId !== tenant.organization.id || statePayload.userId !== tenant.user.id) {
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.servicenow.oauth_failed',
      metadata: { reason: 'invalid_oauth_state' },
    });
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?servicenow=error&reason=invalid_oauth_state', request.url));
  }

  const instanceUrl = normalizeServiceNowInstanceUrl(statePayload.instanceUrl);
  let tokenPayload;
  try {
    tokenPayload = await exchangeServiceNowOAuthCode({ code, requestUrl: request.url, instanceUrl });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'ServiceNow OAuth exchange failed';
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.servicenow.oauth_failed',
      metadata: { reason, instanceUrl },
    });
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?servicenow=error&reason=${encodeURIComponent(reason)}`, request.url));
  }

  const tokens = storedServiceNowTokens(tokenPayload);
  const instanceHost = new URL(instanceUrl).hostname;
  const metadata = {
    instanceUrl,
    instanceHost,
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: 'connected',
    totalServiceNowRecordsProcessed: 0,
  };

  try {
    const integration = await prisma.integration.upsert({
      where: {
        organizationId_provider_externalAccount: {
          organizationId: tenant.organization.id,
          provider: 'SERVICENOW',
          externalAccount: instanceHost,
        },
      },
      update: {
        status: 'CONNECTED',
        scopes: tokenPayload.scope?.split(' ') ?? [],
        encryptedTokens: encryptJson(tokens),
        metadata,
      },
      create: {
        organizationId: tenant.organization.id,
        provider: 'SERVICENOW',
        status: 'CONNECTED',
        externalAccount: instanceHost,
        scopes: tokenPayload.scope?.split(' ') ?? [],
        encryptedTokens: encryptJson(tokens),
        metadata,
      },
    });

    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.servicenow.connected',
      metadata: {
        integrationId: integration.id,
        instanceHost,
      },
    });

    await prisma.event.create({
      data: {
        organizationId: tenant.organization.id,
        integrationId: integration.id,
        type: 'servicenow.oauth.connected',
        payload: { instanceHost } as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    });
  } catch (error) {
    const reason = serviceNowCallbackFailureReason(error);
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.servicenow.oauth_failed',
      metadata: { reason, instanceHost },
    }).catch(() => null);
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?servicenow=error&reason=${encodeURIComponent(reason)}`, request.url));
  }

  return NextResponse.redirect(new URL('/dashboard/settings/integrations?servicenow=connected', request.url));
}
