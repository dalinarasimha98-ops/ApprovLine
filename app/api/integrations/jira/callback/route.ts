import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';
import { encryptJson } from '@/utils/encryption';
import { writeAuditLog } from '@/services/audit';
import {
  exchangeJiraOAuthCode,
  fetchJiraAccessibleResources,
  storedJiraTokens,
  verifyJiraState,
} from '@/services/integrations/jira';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');
  const errorDescription = request.nextUrl.searchParams.get('error_description');
  if (error) {
    const reason = errorDescription ?? error;
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?jira=error&reason=${encodeURIComponent(reason)}`, request.url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?jira=error&reason=missing_oauth_code_or_state', request.url));
  }

  const tenant = await getCurrentTenant();
  const statePayload = verifyJiraState(state);
  if (!statePayload || statePayload.organizationId !== tenant.organization.id || statePayload.userId !== tenant.user.id) {
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.jira.oauth_failed',
      metadata: { reason: 'invalid_oauth_state' },
    });
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?jira=error&reason=invalid_oauth_state', request.url));
  }

  let tokenPayload;
  let resource;
  try {
    tokenPayload = await exchangeJiraOAuthCode({ code, requestUrl: request.url });
    const resources = await fetchJiraAccessibleResources(tokenPayload.access_token);
    resource = resources[0];
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Jira OAuth exchange failed';
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.jira.oauth_failed',
      metadata: { reason },
    });
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?jira=error&reason=${encodeURIComponent(reason)}`, request.url));
  }

  if (!resource?.id) {
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'integration.jira.oauth_failed',
      metadata: { reason: 'missing_jira_site' },
    });
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?jira=error&reason=missing_jira_site', request.url));
  }

  const tokens = storedJiraTokens(tokenPayload);
  const metadata = {
    cloudId: resource.id,
    siteUrl: resource.url,
    siteName: resource.name,
    avatarUrl: resource.avatarUrl,
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: 'connected',
    totalJiraEventsProcessed: 0,
  };

  const integration = await prisma.integration.upsert({
    where: {
      organizationId_provider_externalAccount: {
        organizationId: tenant.organization.id,
        provider: 'JIRA',
        externalAccount: resource.id,
      },
    },
    update: {
      status: 'CONNECTED',
      scopes: tokenPayload.scope?.split(' ') ?? resource.scopes ?? [],
      encryptedTokens: encryptJson(tokens),
      metadata,
    },
    create: {
      organizationId: tenant.organization.id,
      provider: 'JIRA',
      status: 'CONNECTED',
      externalAccount: resource.id,
      scopes: tokenPayload.scope?.split(' ') ?? resource.scopes ?? [],
      encryptedTokens: encryptJson(tokens),
      metadata,
    },
  });

  await writeAuditLog({
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    action: 'integration.jira.connected',
    metadata: {
      integrationId: integration.id,
      cloudId: resource.id,
      siteName: resource.name,
      siteUrl: resource.url,
    },
  });

  await prisma.event.create({
    data: {
      organizationId: tenant.organization.id,
      integrationId: integration.id,
      type: 'jira.oauth.connected',
      payload: { cloudId: resource.id, siteName: resource.name, siteUrl: resource.url } as Prisma.InputJsonValue,
      processedAt: new Date(),
    },
  });

  return NextResponse.redirect(new URL('/dashboard/settings/integrations?jira=connected', request.url));
}
