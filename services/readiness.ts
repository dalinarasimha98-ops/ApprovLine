import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { validateDatabaseUrl } from '@/lib/env';
import { checkRedisConnection } from '@/services/queue/connection';

export type ReadinessStatus = 'ok' | 'missing' | 'error';

export interface ReadinessCheck {
  status: ReadinessStatus;
  message: string;
}

function envCheck(name: keyof typeof env, description: string): ReadinessCheck {
  return env[name]
    ? { status: 'ok', message: `${description} configured` }
    : { status: 'missing', message: `${description} missing` };
}

function databaseUrlHint() {
  const databaseUrl = validateDatabaseUrl();
  if (!databaseUrl.valid) return databaseUrl.safeErrorMessage ? ` ${databaseUrl.safeErrorMessage}` : '';
  try {
    const url = new URL(databaseUrl.normalized!);
    if (url.hostname.startsWith('db.') && url.hostname.endsWith('.supabase.co') && url.port === '5432') {
      return ' DATABASE_URL points to the Supabase direct host on port 5432. On Vercel, use the Supabase Prisma/ORM pooler connection string instead, typically a pooler.supabase.com host, because the direct host can be unreachable from Vercel.';
    }
    if (url.hostname.endsWith('.pooler.supabase.com') && url.port === '5432') {
      return ' DATABASE_URL points to Supabase session mode on port 5432, which can exhaust the shared client limit on Vercel. Use transaction mode on port 6543 with pgbouncer=true and connection_limit=1.';
    }
  } catch {
    return ' DATABASE_URL is not a valid URL.';
  }
  return '';
}

function databaseErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return `${message}${databaseUrlHint()}`;
}

export async function buildReadinessReport() {
  const postgresql = await checkPostgres();
  const redis = await checkRedis();
  const checks = {
    postgresql,
    redis,
    openai: envCheck('OPENAI_API_KEY', 'OpenAI API key'),
    anthropic: envCheck('ANTHROPIC_API_KEY', 'Anthropic API key'),
    slackClientId: envCheck('SLACK_CLIENT_ID', 'Slack client ID'),
    slackClientSecret: envCheck('SLACK_CLIENT_SECRET', 'Slack client secret'),
    slackSigningSecret: envCheck('SLACK_SIGNING_SECRET', 'Slack signing secret'),
    googleClientId: envCheck('GOOGLE_CLIENT_ID', 'Google client ID'),
    googleClientSecret: envCheck('GOOGLE_CLIENT_SECRET', 'Google client secret'),
    microsoftClientId: envCheck('MICROSOFT_CLIENT_ID', 'Microsoft client ID'),
    microsoftClientSecret: envCheck('MICROSOFT_CLIENT_SECRET', 'Microsoft client secret'),
    microsoftTenantId: env.MICROSOFT_TENANT_ID
      ? { status: 'ok' as const, message: 'Microsoft tenant ID configured' }
      : { status: 'missing' as const, message: 'MICROSOFT_TENANT_ID missing; Teams OAuth will use organizations endpoint' },
    jiraClientId: envCheck('JIRA_CLIENT_ID', 'Jira client ID'),
    jiraClientSecret: envCheck('JIRA_CLIENT_SECRET', 'Jira client secret'),
    serviceNowClientId: envCheck('SERVICENOW_CLIENT_ID', 'ServiceNow client ID'),
    serviceNowClientSecret: envCheck('SERVICENOW_CLIENT_SECRET', 'ServiceNow client secret'),
    serviceNowInstanceUrl: envCheck('SERVICENOW_INSTANCE_URL', 'ServiceNow instance URL'),
    zoomClientId: envCheck('ZOOM_CLIENT_ID', 'Zoom client ID'),
    zoomClientSecret: envCheck('ZOOM_CLIENT_SECRET', 'Zoom client secret'),
    universalGatewayApiKey: envCheck('UNIVERSAL_GATEWAY_API_KEY', 'Universal Gateway API key'),
    universalGatewayWebhookSecret: envCheck('UNIVERSAL_GATEWAY_WEBHOOK_SECRET', 'Universal Gateway webhook secret'),
    gmailSyncInterval: env.GMAIL_SYNC_INTERVAL_MINUTES
      ? { status: 'ok' as const, message: `Gmail sync interval ${env.GMAIL_SYNC_INTERVAL_MINUTES} minutes` }
      : { status: 'missing' as const, message: 'GMAIL_SYNC_INTERVAL_MINUTES missing; defaults to 15 minutes' },
    gmailLastSync: await checkGmailLastSync(),
    outlookLastSync: await checkOutlookLastSync(),
    teamsLastSync: await checkTeamsLastSync(),
    jiraLastSync: await checkJiraLastSync(),
    serviceNowLastSync: await checkServiceNowLastSync(),
    zoomLastSync: await checkZoomLastSync(),
    appUrl: envCheck('APP_URL', 'App URL'),
    encryptionKey: envCheck('ENCRYPTION_KEY', 'Encryption key'),
    clerkPublishableKey: envCheck('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'Clerk publishable key'),
    clerkSecretKey: envCheck('CLERK_SECRET_KEY', 'Clerk secret key'),
  };
  const required = [
    checks.postgresql,
    checks.redis,
    checks.anthropic.status === 'ok' ? checks.anthropic : checks.openai,
    checks.appUrl,
    checks.encryptionKey,
    checks.clerkPublishableKey,
    checks.clerkSecretKey,
  ];
  const ready = required.every((check) => check.status === 'ok');
  return {
    ready,
    checkedAt: new Date().toISOString(),
    checks,
  };
}

async function checkZoomLastSync(): Promise<ReadinessCheck> {
  const databaseUrl = validateDatabaseUrl();
  if (!databaseUrl.valid) {
    return { status: databaseUrl.errorCode === 'DATABASE_URL_MISSING' ? 'missing' : 'error', message: databaseUrl.safeErrorMessage ?? 'DATABASE_URL invalid; cannot inspect Zoom sync status' };
  }
  try {
    const integration = await prisma.integration.findFirst({
      where: { provider: 'ZOOM' },
      orderBy: { updatedAt: 'desc' },
      select: { status: true, metadata: true },
    });
    if (!integration) return { status: 'missing', message: 'No Zoom integration connected yet' };
    const metadata = integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {};
    const lastSyncAt = typeof metadata.lastSyncAt === 'string' ? metadata.lastSyncAt : null;
    const lastSyncStatus = typeof metadata.lastSyncStatus === 'string' ? metadata.lastSyncStatus : integration.status.toLowerCase();
    return {
      status: integration.status === 'ERROR' || integration.status === 'NEEDS_REAUTH' ? 'error' : 'ok',
      message: lastSyncAt ? `Last Zoom sync ${lastSyncStatus} at ${lastSyncAt}` : `Zoom ${integration.status.toLowerCase()}; no sync timestamp yet`,
    };
  } catch (error) {
    return { status: 'error', message: databaseErrorMessage(error, 'Unable to inspect Zoom sync status') };
  }
}

async function checkServiceNowLastSync(): Promise<ReadinessCheck> {
  const databaseUrl = validateDatabaseUrl();
  if (!databaseUrl.valid) {
    return { status: databaseUrl.errorCode === 'DATABASE_URL_MISSING' ? 'missing' : 'error', message: databaseUrl.safeErrorMessage ?? 'DATABASE_URL invalid; cannot inspect ServiceNow sync status' };
  }
  try {
    const integration = await prisma.integration.findFirst({
      where: { provider: 'SERVICENOW' },
      orderBy: { updatedAt: 'desc' },
      select: { status: true, metadata: true },
    });
    if (!integration) return { status: 'missing', message: 'No ServiceNow integration connected yet' };
    const metadata = integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {};
    const lastSyncAt = typeof metadata.lastSyncAt === 'string' ? metadata.lastSyncAt : null;
    const lastSyncStatus = typeof metadata.lastSyncStatus === 'string' ? metadata.lastSyncStatus : integration.status.toLowerCase();
    return {
      status: integration.status === 'ERROR' || integration.status === 'NEEDS_REAUTH' ? 'error' : 'ok',
      message: lastSyncAt ? `Last ServiceNow sync ${lastSyncStatus} at ${lastSyncAt}` : `ServiceNow ${integration.status.toLowerCase()}; no sync timestamp yet`,
    };
  } catch (error) {
    return { status: 'error', message: databaseErrorMessage(error, 'Unable to inspect ServiceNow sync status') };
  }
}

async function checkJiraLastSync(): Promise<ReadinessCheck> {
  const databaseUrl = validateDatabaseUrl();
  if (!databaseUrl.valid) {
    return { status: databaseUrl.errorCode === 'DATABASE_URL_MISSING' ? 'missing' : 'error', message: databaseUrl.safeErrorMessage ?? 'DATABASE_URL invalid; cannot inspect Jira sync status' };
  }
  try {
    const integration = await prisma.integration.findFirst({
      where: { provider: 'JIRA' },
      orderBy: { updatedAt: 'desc' },
      select: { status: true, metadata: true },
    });
    if (!integration) return { status: 'missing', message: 'No Jira integration connected yet' };
    const metadata = integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {};
    const lastSyncAt = typeof metadata.lastSyncAt === 'string' ? metadata.lastSyncAt : null;
    const lastSyncStatus = typeof metadata.lastSyncStatus === 'string' ? metadata.lastSyncStatus : integration.status.toLowerCase();
    return {
      status: integration.status === 'ERROR' || integration.status === 'NEEDS_REAUTH' ? 'error' : 'ok',
      message: lastSyncAt ? `Last Jira sync ${lastSyncStatus} at ${lastSyncAt}` : `Jira ${integration.status.toLowerCase()}; no sync timestamp yet`,
    };
  } catch (error) {
    return { status: 'error', message: databaseErrorMessage(error, 'Unable to inspect Jira sync status') };
  }
}

async function checkGmailLastSync(): Promise<ReadinessCheck> {
  const databaseUrl = validateDatabaseUrl();
  if (!databaseUrl.valid) {
    return { status: databaseUrl.errorCode === 'DATABASE_URL_MISSING' ? 'missing' : 'error', message: databaseUrl.safeErrorMessage ?? 'DATABASE_URL invalid; cannot inspect Gmail sync status' };
  }
  try {
    const integration = await prisma.integration.findFirst({
      where: { provider: 'GMAIL' },
      orderBy: { updatedAt: 'desc' },
      select: { status: true, metadata: true },
    });
    if (!integration) return { status: 'missing', message: 'No Gmail integration connected yet' };
    const metadata = integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {};
    const lastSyncAt = typeof metadata.lastSyncAt === 'string' ? metadata.lastSyncAt : null;
    const lastSyncStatus = typeof metadata.lastSyncStatus === 'string' ? metadata.lastSyncStatus : integration.status.toLowerCase();
    return {
      status: integration.status === 'ERROR' || integration.status === 'NEEDS_REAUTH' ? 'error' : 'ok',
      message: lastSyncAt ? `Last Gmail sync ${lastSyncStatus} at ${lastSyncAt}` : `Gmail ${integration.status.toLowerCase()}; no sync timestamp yet`,
    };
  } catch (error) {
    return { status: 'error', message: databaseErrorMessage(error, 'Unable to inspect Gmail sync status') };
  }
}

async function checkOutlookLastSync(): Promise<ReadinessCheck> {
  const databaseUrl = validateDatabaseUrl();
  if (!databaseUrl.valid) {
    return { status: databaseUrl.errorCode === 'DATABASE_URL_MISSING' ? 'missing' : 'error', message: databaseUrl.safeErrorMessage ?? 'DATABASE_URL invalid; cannot inspect Outlook sync status' };
  }
  try {
    const integration = await prisma.integration.findFirst({
      where: { provider: 'OUTLOOK' },
      orderBy: { updatedAt: 'desc' },
      select: { status: true, metadata: true },
    });
    if (!integration) return { status: 'missing', message: 'No Outlook or Exchange integration connected yet' };
    const metadata = integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {};
    const lastSyncAt = typeof metadata.lastSyncAt === 'string' ? metadata.lastSyncAt : null;
    const lastSyncStatus = typeof metadata.lastSyncStatus === 'string' ? metadata.lastSyncStatus : integration.status.toLowerCase();
    return {
      status: integration.status === 'ERROR' || integration.status === 'NEEDS_REAUTH' ? 'error' : 'ok',
      message: lastSyncAt ? `Last Outlook/Exchange sync ${lastSyncStatus} at ${lastSyncAt}` : `Outlook/Exchange ${integration.status.toLowerCase()}; no sync timestamp yet`,
    };
  } catch (error) {
    return { status: 'error', message: databaseErrorMessage(error, 'Unable to inspect Outlook/Exchange sync status') };
  }
}

async function checkTeamsLastSync(): Promise<ReadinessCheck> {
  const databaseUrl = validateDatabaseUrl();
  if (!databaseUrl.valid) {
    return { status: databaseUrl.errorCode === 'DATABASE_URL_MISSING' ? 'missing' : 'error', message: databaseUrl.safeErrorMessage ?? 'DATABASE_URL invalid; cannot inspect Teams sync status' };
  }
  try {
    const integration = await prisma.integration.findFirst({
      where: { provider: 'MICROSOFT_TEAMS' },
      orderBy: { updatedAt: 'desc' },
      select: { status: true, metadata: true },
    });
    if (!integration) return { status: 'missing', message: 'No Microsoft Teams integration connected yet' };
    const metadata = integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {};
    const lastSyncAt = typeof metadata.lastSyncAt === 'string' ? metadata.lastSyncAt : null;
    const lastSyncStatus = typeof metadata.lastSyncStatus === 'string' ? metadata.lastSyncStatus : integration.status.toLowerCase();
    return {
      status: integration.status === 'ERROR' || integration.status === 'NEEDS_REAUTH' ? 'error' : 'ok',
      message: lastSyncAt ? `Last Teams sync ${lastSyncStatus} at ${lastSyncAt}` : `Teams ${integration.status.toLowerCase()}; no sync timestamp yet`,
    };
  } catch (error) {
    return { status: 'error', message: databaseErrorMessage(error, 'Unable to inspect Teams sync status') };
  }
}

async function checkPostgres(): Promise<ReadinessCheck> {
  const databaseUrl = validateDatabaseUrl();
  if (!databaseUrl.valid) {
    return { status: databaseUrl.errorCode === 'DATABASE_URL_MISSING' ? 'missing' : 'error', message: databaseUrl.safeErrorMessage ?? 'DATABASE_URL invalid' };
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', message: 'PostgreSQL reachable' };
  } catch (error) {
    return { status: 'error', message: databaseErrorMessage(error, 'PostgreSQL unavailable') };
  }
}

async function checkRedis(): Promise<ReadinessCheck> {
  const redis = await checkRedisConnection();
  return { status: redis.status, message: redis.message };
}
