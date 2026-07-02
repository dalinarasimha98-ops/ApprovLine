import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';
import { encryptJson } from '@/utils/encryption';
import { writeAuditLog } from '@/services/audit';
import {
  exchangeOutlookOAuthCode,
  fetchOutlookProfile,
  outlookTenantIdFromToken,
  storedOutlookTokens,
  verifyOutlookState,
} from '@/services/integrations/outlook';

export const dynamic = 'force-dynamic';

function outlookCallbackFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : 'Outlook connection storage failed';
  if (
    message.includes('Invalid value for argument `provider`') ||
    message.includes('invalid input value for enum') ||
    message.includes('IntegrationProvider') ||
    message.includes('OUTLOOK')
  ) {
    return 'outlook_database_migration_required';
  }
  return message;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');
  if (error) return NextResponse.redirect(new URL(`/dashboard/settings/integrations?outlook=error&reason=${encodeURIComponent(error)}`, request.url));
  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?outlook=error&reason=missing_oauth_code_or_state', request.url));
  }

  const tenant = await getCurrentTenant();
  const statePayload = verifyOutlookState(state);
  if (!statePayload || statePayload.organizationId !== tenant.organization.id || statePayload.userId !== tenant.user.id) {
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.outlook.oauth_failed',
      metadata: { reason: 'invalid_oauth_state' },
    });
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?outlook=error&reason=invalid_oauth_state', request.url));
  }

  let tokenPayload;
  let profile;
  try {
    tokenPayload = await exchangeOutlookOAuthCode({ code, requestUrl: request.url });
    profile = await fetchOutlookProfile(tokenPayload.access_token);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Outlook OAuth exchange failed';
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.outlook.oauth_failed',
      metadata: { reason },
    });
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?outlook=error&reason=${encodeURIComponent(reason)}`, request.url));
  }

  const tenantId = outlookTenantIdFromToken(tokenPayload);
  const accountEmail = profile.mail ?? profile.userPrincipalName;
  const accountId = tenantId ? `${tenantId}:${profile.id}` : profile.id;
  if (!profile.id || !accountId) {
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.outlook.oauth_failed',
      metadata: { reason: 'missing_microsoft_profile' },
    });
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?outlook=error&reason=missing_microsoft_profile', request.url));
  }

  const tokens = storedOutlookTokens(tokenPayload);
  const metadata = {
    tenantId,
    microsoftUserId: profile.id,
    accountEmail,
    accountName: profile.displayName,
    mailboxType: 'outlook_exchange',
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: 'connected',
    totalEmailsProcessed: 0,
  };

  try {
    const integration = await prisma.integration.upsert({
      where: {
        organizationId_provider_externalAccount: {
          organizationId: tenant.organization.id,
          provider: 'OUTLOOK',
          externalAccount: accountId,
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
        provider: 'OUTLOOK',
        status: 'CONNECTED',
        externalAccount: accountId,
        scopes: tokenPayload.scope?.split(' ') ?? [],
        encryptedTokens: encryptJson(tokens),
        metadata,
      },
    });

    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.outlook.connected',
      metadata: {
        integrationId: integration.id,
        tenantId,
        microsoftUserId: profile.id,
        accountEmail,
      },
    });

    await prisma.event.create({
      data: {
        organizationId: tenant.organization.id,
        integrationId: integration.id,
        type: 'outlook.oauth.connected',
        payload: { tenantId, microsoftUserId: profile.id, accountEmail } as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    });
  } catch (error) {
    const reason = outlookCallbackFailureReason(error);
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.outlook.oauth_failed',
      metadata: { reason },
    }).catch(() => null);
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?outlook=error&reason=${encodeURIComponent(reason)}`, request.url));
  }

  return NextResponse.redirect(new URL('/dashboard/settings/integrations?outlook=connected', request.url));
}
