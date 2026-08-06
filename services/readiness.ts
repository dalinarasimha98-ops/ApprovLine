import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { validateDatabaseUrl } from '@/lib/env';
import { withTimeout } from '@/lib/performance';
import { checkRedisConnection } from '@/services/queue/connection';
import { generationGatewayStatus } from '@/services/ai/gateway';
import { embeddingGatewayStatus } from '@/services/ai/embeddingGateway';

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

/**
 * Reports whether the AI Gateway is actually serving generation from its
 * primary provider (Anthropic), not just whether a key is present. Falling
 * back to a secondary provider is a supported transitional state (see the
 * migration plan) but must never be silent — this check is how it surfaces.
 */
function aiGatewayCheck(): ReadinessCheck {
  const status = generationGatewayStatus();
  if (status.configured.length === 0) {
    return { status: 'missing', message: 'No generation provider configured (set ANTHROPIC_API_KEY).' };
  }

  const anthropicTelemetry = status.telemetry.find((entry) => entry?.provider === 'anthropic');
  if (anthropicTelemetry && anthropicTelemetry.totalCalls > 0 && anthropicTelemetry.totalFailures === anthropicTelemetry.totalCalls) {
    return {
      status: 'error',
      message: `Anthropic generation failing this instance: ${anthropicTelemetry.lastError ?? 'unknown error'}.`,
    };
  }

  const usingFallback = status.configured[0] !== status.primaryProvider;
  if (usingFallback) {
    return {
      status: 'error',
      message: `Primary provider "${status.primaryProvider}" is not configured; generation is running on fallback chain [${status.configured.join(', ')}] only.`,
    };
  }

  return {
    status: 'ok',
    message:
      anthropicTelemetry && anthropicTelemetry.totalCalls > 0
        ? `Anthropic generation healthy this instance: last latency ${anthropicTelemetry.lastLatencyMs}ms, ${anthropicTelemetry.totalFailures} failure(s) of ${anthropicTelemetry.totalCalls} call(s).`
        : 'Anthropic configured as primary generation provider. No calls recorded yet this instance (telemetry is per-instance, not durable).',
  };
}

/**
 * Reports whether the Embedding Provider (Voyage AI) is actually available.
 * Unlike aiGatewayCheck(), there is no fallback tier to fall back to here —
 * "missing"/"error" is the correct, visible state when it's unavailable,
 * per the no-silent-degradation requirement in the approved migration plan.
 */
function embeddingGatewayCheck(): ReadinessCheck {
  const status = embeddingGatewayStatus();
  if (!status.activeProvider) {
    return {
      status: 'missing',
      message: 'No embedding provider configured (set VOYAGE_API_KEY). Playbook indexing and search will fail explicitly rather than degrade to a non-semantic fallback.',
    };
  }

  const telemetry = status.telemetry;
  if (telemetry && telemetry.totalCalls > 0 && telemetry.totalFailures === telemetry.totalCalls) {
    return {
      status: 'error',
      message: `${status.activeProvider} embeddings failing this instance: ${telemetry.lastError ?? 'unknown error'}.`,
    };
  }

  return {
    status: 'ok',
    message:
      telemetry && telemetry.totalCalls > 0
        ? `${status.activeProvider} (${status.activeModel}, ${status.activeDimensions}d) healthy this instance: last latency ${telemetry.lastLatencyMs}ms, ${telemetry.totalFailures} failure(s) of ${telemetry.totalCalls} call(s).`
        : `${status.activeProvider} (${status.activeModel}, ${status.activeDimensions}d) configured as embedding provider. No calls recorded yet this instance.`,
  };
}

const READINESS_CHECK_TIMEOUT_MS = 3000;

function timedCheck(label: string, promise: Promise<ReadinessCheck>): Promise<ReadinessCheck> {
  return withTimeout(label, promise, READINESS_CHECK_TIMEOUT_MS).catch((error) => ({
    status: 'error',
    message: error instanceof Error ? error.message : `${label} timed out`,
  }));
}

export async function buildReadinessReport() {
  // These 8 checks are each their own DB round trip (Postgres, Redis, and
  // one per connector's last-sync lookup) and were previously awaited one
  // at a time — under a connection_limit=1 pool, that serialized ~8 round
  // trips into a single request, which is what made /health take ~7-8s.
  // Nothing here depends on another check's result, so Promise.all is a
  // straightforward, zero-risk fix; the per-check timeout means one slow
  // connector lookup can no longer hold up every other check either.
  const [postgresql, redis, gmailLastSync, outlookLastSync, teamsLastSync, jiraLastSync, serviceNowLastSync, zoomLastSync] = await Promise.all([
    timedCheck('readiness:postgres', checkPostgres()),
    timedCheck('readiness:redis', checkRedis()),
    timedCheck('readiness:gmailLastSync', checkGmailLastSync()),
    timedCheck('readiness:outlookLastSync', checkOutlookLastSync()),
    timedCheck('readiness:teamsLastSync', checkTeamsLastSync()),
    timedCheck('readiness:jiraLastSync', checkJiraLastSync()),
    timedCheck('readiness:serviceNowLastSync', checkServiceNowLastSync()),
    timedCheck('readiness:zoomLastSync', checkZoomLastSync()),
  ]);

  const checks = {
    postgresql,
    redis,
    openai: envCheck('OPENAI_API_KEY', 'OpenAI API key'),
    anthropic: envCheck('ANTHROPIC_API_KEY', 'Anthropic API key'),
    aiGateway: aiGatewayCheck(),
    voyage: envCheck('VOYAGE_API_KEY', 'Voyage API key'),
    embeddingGateway: embeddingGatewayCheck(),
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
    gmailLastSync,
    outlookLastSync,
    teamsLastSync,
    jiraLastSync,
    serviceNowLastSync,
    zoomLastSync,
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

/**
 * Cached entry point for /health specifically — a public page any uptime
 * monitor or human can hit repeatedly, and a real system status rarely
 * changes second to second. Parallelizing buildReadinessReport() above
 * already fixes the root cause (was ~7-8s from 8 sequential DB round
 * trips, now bounded by the slowest single check), but caching means a
 * repeat hit within the window resolves without touching the database at
 * all. Kept as a separate wrapper rather than caching buildReadinessReport()
 * itself, because that function is also called from scripts/readiness.ts
 * (a standalone CLI script with no Next.js server context — unstable_cache
 * would throw there) and from the debug/integrations-health API routes,
 * which should always report the current, uncached state.
 */
const getCachedHealthReport = unstable_cache(() => buildReadinessReport(), ['health-report'], { revalidate: 30 });
export const buildHealthPageReport = cache(() => getCachedHealthReport());

/**
 * Lightweight readiness snapshot for pages that explain platform posture.
 * Connector sync history and Redis are intentionally excluded so an optional
 * dependency can never prevent the Compliance Hub from rendering.
 */
async function buildComplianceReadinessReportFresh() {
  const postgresql = await Promise.race<ReadinessCheck>([
    checkPostgres(),
    new Promise((resolve) => {
      setTimeout(
        () => resolve({ status: 'error', message: 'Database readiness check timed out; compliance content remains available.' }),
        1200,
      );
    }),
  ]);
  const checks = {
    postgresql,
    openai: envCheck('OPENAI_API_KEY', 'OpenAI API key'),
    anthropic: envCheck('ANTHROPIC_API_KEY', 'Anthropic API key'),
    slackClientId: envCheck('SLACK_CLIENT_ID', 'Slack client ID'),
    googleClientId: envCheck('GOOGLE_CLIENT_ID', 'Google client ID'),
    microsoftClientId: envCheck('MICROSOFT_CLIENT_ID', 'Microsoft client ID'),
    jiraClientId: envCheck('JIRA_CLIENT_ID', 'Jira client ID'),
    serviceNowClientId: envCheck('SERVICENOW_CLIENT_ID', 'ServiceNow client ID'),
    zoomClientId: envCheck('ZOOM_CLIENT_ID', 'Zoom client ID'),
    encryptionKey: envCheck('ENCRYPTION_KEY', 'Encryption key'),
    clerkPublishableKey: envCheck('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'Clerk publishable key'),
    clerkSecretKey: envCheck('CLERK_SECRET_KEY', 'Clerk secret key'),
  };
  const required = [
    checks.postgresql,
    checks.anthropic.status === 'ok' ? checks.anthropic : checks.openai,
    checks.encryptionKey,
    checks.clerkPublishableKey,
    checks.clerkSecretKey,
  ];

  return {
    ready: required.every((check) => check.status === 'ok'),
    checkedAt: new Date().toISOString(),
    checks,
  };
}

/**
 * This report is env-config + a single Postgres ping — not tenant-scoped
 * data — so it caches globally rather than per-organization. Compliance Hub
 * renders it in two separate places (an overview grid and a service-status
 * strip), each in its own Suspense boundary; caching here means the second
 * one is served instantly instead of re-running the Postgres ping.
 */
const getCachedComplianceReadinessReport = unstable_cache(
  () => buildComplianceReadinessReportFresh(),
  ['compliance-readiness-report'],
  { revalidate: 180 },
);

export const buildComplianceReadinessReport = cache(() => getCachedComplianceReadinessReport());

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
