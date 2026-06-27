import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';
import { encryptJson } from '@/utils/encryption';
import { exchangeSlackOAuthCode, verifySlackState } from '@/services/integrations/slack';
import { writeAuditLog } from '@/services/audit';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');
  if (error) return NextResponse.redirect(new URL(`/dashboard/settings/integrations?slack=error&reason=${error}`, request.url));
  if (!code || !state) return NextResponse.json({ error: 'Missing Slack OAuth code or state' }, { status: 400 });

  const tenant = await getCurrentTenant();
  const statePayload = verifySlackState(state);
  if (!statePayload || statePayload.organizationId !== tenant.organization.id) {
    return NextResponse.json({ error: 'Invalid Slack OAuth state' }, { status: 400 });
  }

  const slack = await exchangeSlackOAuthCode({ code, requestUrl: request.url });
  const teamId = slack.team?.id;
  if (!teamId || !slack.access_token) {
    return NextResponse.json({ error: 'Slack did not return a workspace token' }, { status: 400 });
  }

  const integration = await prisma.integration.upsert({
    where: {
      organizationId_provider_externalAccount: {
        organizationId: tenant.organization.id,
        provider: 'SLACK',
        externalAccount: teamId,
      },
    },
    update: {
      status: 'CONNECTED',
      scopes: slack.scope?.split(',') ?? [],
      encryptedTokens: encryptJson({
        access_token: slack.access_token,
        bot_user_id: slack.bot_user_id,
        authed_user_id: slack.authed_user?.id,
      }),
      metadata: {
        teamId,
        teamName: slack.team?.name,
        enterpriseId: slack.enterprise?.id,
        enterpriseName: slack.enterprise?.name,
        lastSyncAt: new Date().toISOString(),
      },
    },
    create: {
      organizationId: tenant.organization.id,
      provider: 'SLACK',
      status: 'CONNECTED',
      externalAccount: teamId,
      scopes: slack.scope?.split(',') ?? [],
      encryptedTokens: encryptJson({
        access_token: slack.access_token,
        bot_user_id: slack.bot_user_id,
        authed_user_id: slack.authed_user?.id,
      }),
      metadata: {
        teamId,
        teamName: slack.team?.name,
        enterpriseId: slack.enterprise?.id,
        enterpriseName: slack.enterprise?.name,
        lastSyncAt: new Date().toISOString(),
      },
    },
  });

  await writeAuditLog({
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    action: 'integration.slack.connected',
    metadata: { integrationId: integration.id, teamId, teamName: slack.team?.name },
  });

  return NextResponse.redirect(new URL('/dashboard/settings/integrations?slack=connected', request.url));
}
