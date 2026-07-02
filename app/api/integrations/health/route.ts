import { NextResponse } from 'next/server';
import { env } from '@/config/env';
import { buildReadinessReport } from '@/services/readiness';

export const dynamic = 'force-dynamic';

function connectorStatus(configured: boolean) {
  return { status: configured ? 'connected' : 'not_connected' };
}

export async function GET() {
  const readiness = await buildReadinessReport();

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    services: {
      postgresql: readiness.checks.postgresql,
      redis: readiness.checks.redis,
      openai: readiness.checks.openai,
      anthropic: readiness.checks.anthropic,
      ai: connectorStatus(Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY)),
      appUrl: readiness.checks.appUrl,
      gmailApi: readiness.checks.gmailLastSync,
      outlookApi: readiness.checks.outlookLastSync,
      teamsApi: readiness.checks.teamsLastSync,
      jiraApi: readiness.checks.jiraLastSync,
    },
    connectors: {
      slack: connectorStatus(Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET)),
      gmail: connectorStatus(Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)),
      outlook: connectorStatus(Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET)),
      teams: connectorStatus(Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET)),
      jira: connectorStatus(Boolean(env.JIRA_CLIENT_ID && env.JIRA_CLIENT_SECRET)),
      zoom: connectorStatus(Boolean(env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET)),
    },
    states: ['connected', 'not_connected', 'error', 'needs_reauthentication', 'syncing'],
  });
}
