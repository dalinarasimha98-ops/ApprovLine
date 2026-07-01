import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';
import { encryptJson } from '@/utils/encryption';
import { writeAuditLog } from '@/services/audit';
import {
  exchangeTeamsOAuthCode,
  fetchTeamsProfile,
  storedTeamsTokens,
  teamsTenantIdFromToken,
  verifyTeamsState,
} from '@/services/integrations/teams';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');
  if (error) return NextResponse.redirect(new URL(`/dashboard/settings/integrations?teams=error&reason=${encodeURIComponent(error)}`, request.url));
  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?teams=error&reason=missing_oauth_code_or_state', request.url));
  }

  const tenant = await getCurrentTenant();
  const statePayload = verifyTeamsState(state);
  if (!statePayload || statePayload.organizationId !== tenant.organization.id || statePayload.userId !== tenant.user.id) {
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.teams.oauth_failed',
      metadata: { reason: 'invalid_oauth_state' },
    });
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?teams=error&reason=invalid_oauth_state', request.url));
  }

  let tokenPayload;
  let profile;
  try {
    tokenPayload = await exchangeTeamsOAuthCode({ code, requestUrl: request.url });
    profile = await fetchTeamsProfile(tokenPayload.access_token);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Microsoft Teams OAuth exchange failed';
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.teams.oauth_failed',
      metadata: { reason },
    });
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?teams=error&reason=${encodeURIComponent(reason)}`, request.url));
  }

  const tenantId = teamsTenantIdFromToken(tokenPayload);
  const accountEmail = profile.mail ?? profile.userPrincipalName;
  const accountId = tenantId ? `${tenantId}:${profile.id}` : profile.id;
  if (!profile.id || !accountId) {
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.teams.oauth_failed',
      metadata: { reason: 'missing_microsoft_profile' },
    });
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?teams=error&reason=missing_microsoft_profile', request.url));
  }

  const tokens = storedTeamsTokens(tokenPayload);
  const metadata = {
    tenantId,
    microsoftUserId: profile.id,
    accountEmail,
    accountName: profile.displayName,
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: 'connected',
    totalTeamsMessagesProcessed: 0,
  };

  const integration = await prisma.integration.upsert({
    where: {
      organizationId_provider_externalAccount: {
        organizationId: tenant.organization.id,
        provider: 'MICROSOFT_TEAMS',
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
      provider: 'MICROSOFT_TEAMS',
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
    action: 'integration.teams.connected',
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
      type: 'teams.oauth.connected',
      payload: { tenantId, microsoftUserId: profile.id, accountEmail } as Prisma.InputJsonValue,
      processedAt: new Date(),
    },
  });

  return NextResponse.redirect(new URL('/dashboard/settings/integrations?teams=connected', request.url));
}
