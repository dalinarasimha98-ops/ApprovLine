import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';
import { encryptJson } from '@/utils/encryption';
import { writeAuditLog } from '@/services/audit';
import {
  exchangeGmailOAuthCode,
  fetchGmailProfile,
  storedGmailTokens,
  verifyGmailState,
} from '@/services/integrations/gmail';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');
  if (error) return NextResponse.redirect(new URL(`/dashboard/settings/integrations?gmail=error&reason=${encodeURIComponent(error)}`, request.url));
  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?gmail=error&reason=missing_oauth_code_or_state', request.url));
  }

  const tenant = await getCurrentTenant();
  const statePayload = verifyGmailState(state);
  if (!statePayload || statePayload.organizationId !== tenant.organization.id || statePayload.userId !== tenant.user.id) {
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.gmail.oauth_failed',
      metadata: { reason: 'invalid_oauth_state' },
    });
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?gmail=error&reason=invalid_oauth_state', request.url));
  }

  let tokenPayload;
  let profile;
  try {
    tokenPayload = await exchangeGmailOAuthCode({ code, requestUrl: request.url });
    profile = await fetchGmailProfile(tokenPayload.access_token);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Google OAuth exchange failed';
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.gmail.oauth_failed',
      metadata: { reason },
    });
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?gmail=error&reason=${encodeURIComponent(reason)}`, request.url));
  }

  const accountId = profile.sub ?? profile.id ?? profile.email;
  if (!accountId || !profile.email) {
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.gmail.oauth_failed',
      metadata: { reason: 'missing_google_account_profile' },
    });
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?gmail=error&reason=missing_google_account_profile', request.url));
  }

  const tokens = storedGmailTokens(tokenPayload);
  const integration = await prisma.integration.upsert({
    where: {
      organizationId_provider_externalAccount: {
        organizationId: tenant.organization.id,
        provider: 'GMAIL',
        externalAccount: accountId,
      },
    },
    update: {
      status: 'CONNECTED',
      scopes: tokenPayload.scope?.split(' ') ?? [],
      encryptedTokens: encryptJson(tokens),
      metadata: {
        accountId,
        accountEmail: profile.email,
        accountName: profile.name,
        workspaceDomain: profile.hd ?? profile.email.split('@')[1],
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'connected',
        totalEmailsProcessed: 0,
      },
    },
    create: {
      organizationId: tenant.organization.id,
      provider: 'GMAIL',
      status: 'CONNECTED',
      externalAccount: accountId,
      scopes: tokenPayload.scope?.split(' ') ?? [],
      encryptedTokens: encryptJson(tokens),
      metadata: {
        accountId,
        accountEmail: profile.email,
        accountName: profile.name,
        workspaceDomain: profile.hd ?? profile.email.split('@')[1],
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'connected',
        totalEmailsProcessed: 0,
      },
    },
  });

  await writeAuditLog({
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    action: 'integration.gmail.connected',
    metadata: {
      integrationId: integration.id,
      accountId,
      accountEmail: profile.email,
      workspaceDomain: profile.hd ?? profile.email.split('@')[1],
    },
  });

  await prisma.event.create({
    data: {
      organizationId: tenant.organization.id,
      integrationId: integration.id,
      type: 'gmail.oauth.connected',
      payload: { accountId, accountEmail: profile.email } as Prisma.InputJsonValue,
      processedAt: new Date(),
    },
  });

  return NextResponse.redirect(new URL('/dashboard/settings/integrations?gmail=connected', request.url));
}
