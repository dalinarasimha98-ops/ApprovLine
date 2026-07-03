import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';
import { encryptJson } from '@/utils/encryption';
import { writeAuditLog } from '@/services/audit';
import {
  exchangeZoomOAuthCode,
  fetchZoomUser,
  storedZoomTokens,
  verifyZoomState,
  ZOOM_READ_ONLY_SCOPES,
} from '@/services/integrations/zoom';

export const dynamic = 'force-dynamic';

function zoomCallbackFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : 'Zoom connection storage failed';
  if (
    message.includes('Invalid value for argument `provider`') ||
    message.includes('invalid input value for enum') ||
    message.includes('IntegrationProvider') ||
    message.includes('ZOOM')
  ) {
    return 'zoom_database_migration_required';
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
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?zoom=error&reason=${encodeURIComponent(reason)}`, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?zoom=error&reason=missing_oauth_code_or_state', request.url));
  }

  const tenant = await getCurrentTenant();
  const statePayload = verifyZoomState(state);
  if (!statePayload || statePayload.organizationId !== tenant.organization.id || statePayload.userId !== tenant.user.id) {
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.zoom.oauth_failed',
      metadata: { reason: 'invalid_oauth_state' },
    });
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?zoom=error&reason=invalid_oauth_state', request.url));
  }

  let tokenPayload;
  let zoomUser;
  try {
    tokenPayload = await exchangeZoomOAuthCode({ code, requestUrl: request.url });
    zoomUser = await fetchZoomUser(tokenPayload.access_token);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Zoom OAuth exchange failed';
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.zoom.oauth_failed',
      metadata: { reason },
    });
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?zoom=error&reason=${encodeURIComponent(reason)}`, request.url));
  }

  const externalAccount = zoomUser.account_id ?? zoomUser.id ?? zoomUser.email;
  if (!externalAccount) {
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.zoom.oauth_failed',
      metadata: { reason: 'missing_zoom_account' },
    });
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?zoom=error&reason=missing_zoom_account', request.url));
  }

  const userName = zoomUser.display_name ?? [zoomUser.first_name, zoomUser.last_name].filter(Boolean).join(' ');
  const tokens = storedZoomTokens(tokenPayload);
  const metadata = {
    accountId: zoomUser.account_id,
    userId: zoomUser.id,
    userEmail: zoomUser.email,
    userName,
    accountType: zoomUser.type,
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: 'connected',
    totalZoomTranscriptsProcessed: 0,
  };

  try {
    const integration = await prisma.integration.upsert({
      where: {
        organizationId_provider_externalAccount: {
          organizationId: tenant.organization.id,
          provider: 'ZOOM',
          externalAccount,
        },
      },
      update: {
        status: 'CONNECTED',
        scopes: tokenPayload.scope?.split(' ') ?? ZOOM_READ_ONLY_SCOPES.split(' '),
        encryptedTokens: encryptJson(tokens),
        metadata,
      },
      create: {
        organizationId: tenant.organization.id,
        provider: 'ZOOM',
        status: 'CONNECTED',
        externalAccount,
        scopes: tokenPayload.scope?.split(' ') ?? ZOOM_READ_ONLY_SCOPES.split(' '),
        encryptedTokens: encryptJson(tokens),
        metadata,
      },
    });

    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.zoom.connected',
      metadata: {
        integrationId: integration.id,
        accountId: zoomUser.account_id,
        userId: zoomUser.id,
        userEmail: zoomUser.email,
      },
    });

    await prisma.event.create({
      data: {
        organizationId: tenant.organization.id,
        integrationId: integration.id,
        type: 'zoom.oauth.connected',
        payload: {
          accountId: zoomUser.account_id,
          userId: zoomUser.id,
          userEmail: zoomUser.email,
        } as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    });
  } catch (error) {
    const reason = zoomCallbackFailureReason(error);
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.zoom.oauth_failed',
      metadata: { reason },
    }).catch(() => null);
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?zoom=error&reason=${encodeURIComponent(reason)}`, request.url));
  }

  return NextResponse.redirect(new URL('/dashboard/settings/integrations?zoom=connected', request.url));
}
