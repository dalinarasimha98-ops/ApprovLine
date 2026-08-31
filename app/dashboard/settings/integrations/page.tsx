import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getDashboardTenant } from '@/lib/auth';
import { withTimeout } from '@/lib/performance';
import { redirect } from 'next/navigation';
import { enforcePageRole } from '@/lib/rbac';
import { IntegrationsClientShell } from '@/components/integrations/IntegrationsClientShell';
import type { ShellProvider, ShellRequest } from '@/components/integrations/IntegrationsClientShell';
import { RequestIntegrationButton } from '@/components/integrations/RequestIntegrationButton';
import { type Prisma, IntegrationProvider } from '@prisma/client';

export const dynamic = 'force-dynamic';

// ── Provider → Integration enum mapping ───────────────────────────────────────

const PROVIDER_TO_SLUG: Record<string, string> = {
  SLACK: 'slack',
  GMAIL: 'gmail',
  OUTLOOK: 'outlook',
  MICROSOFT_TEAMS: 'microsoft_teams',
  JIRA: 'jira',
  SERVICENOW: 'servicenow',
  ZOOM: 'zoom',
};

const SLUG_TO_CONNECT_HREF: Record<string, string> = {
  slack: '/api/integrations/slack/install',
  gmail: '/api/integrations/gmail/install',
  outlook: '/api/integrations/outlook/install',
  microsoft_teams: '/api/integrations/teams/install',
  jira: '/api/integrations/jira/install',
  servicenow: '/api/integrations/servicenow/install',
  zoom: '/api/integrations/zoom/install',
};

const SLUG_TO_SYNC_HREF: Record<string, string> = {
  gmail: '/api/integrations/gmail/sync',
  outlook: '/api/integrations/outlook/sync',
  microsoft_teams: '/api/integrations/teams/sync',
  jira: '/api/integrations/jira/sync',
  servicenow: '/api/integrations/servicenow/sync',
  zoom: '/api/integrations/zoom/sync',
};

// Slack only – others don't expose a disconnect route yet
const SLUG_TO_DISCONNECT_HREF: Record<string, string> = {
  slack: '/api/integrations/slack/disconnect',
};

// Fallback static provider list when MarketplaceProvider table is empty
const STATIC_PROVIDERS: ShellProvider[] = [
  {
    slug: 'slack', displayName: 'Slack', category: 'Communication',
    description: 'Track decisions made in Slack channels, DMs and huddles. Captures approval evidence from real-time conversations.',
    websiteUrl: 'https://slack.com', status: 'AVAILABLE', isNative: true, isGeneric: false,
    requestCount: 0, connectHref: '/api/integrations/slack/install',
    isConnected: false, syncHref: undefined, disconnectHref: '/api/integrations/slack/disconnect',
  },
  {
    slug: 'gmail', displayName: 'Gmail', category: 'Email',
    description: 'Capture decisions from email threads and approval chains in Gmail.',
    websiteUrl: 'https://gmail.com', status: 'AVAILABLE', isNative: true, isGeneric: false,
    requestCount: 0, connectHref: '/api/integrations/gmail/install',
    isConnected: false, syncHref: '/api/integrations/gmail/sync',
  },
  {
    slug: 'outlook', displayName: 'Outlook / Exchange', category: 'Email',
    description: 'Sync decision emails from Microsoft Outlook and Exchange.',
    websiteUrl: 'https://outlook.microsoft.com', status: 'AVAILABLE', isNative: true, isGeneric: false,
    requestCount: 0, connectHref: '/api/integrations/outlook/install',
    isConnected: false, syncHref: '/api/integrations/outlook/sync',
  },
  {
    slug: 'microsoft_teams', displayName: 'Microsoft Teams', category: 'Communication',
    description: 'Capture decisions from Teams meetings, channels, chats and adaptive card approvals.',
    websiteUrl: 'https://teams.microsoft.com', status: 'AVAILABLE', isNative: true, isGeneric: false,
    requestCount: 0, connectHref: '/api/integrations/teams/install',
    isConnected: false, syncHref: '/api/integrations/teams/sync',
  },
  {
    slug: 'zoom', displayName: 'Zoom', category: 'Meetings',
    description: 'Automatically extract decisions from Zoom meeting transcripts and recordings.',
    websiteUrl: 'https://zoom.us', status: 'AVAILABLE', isNative: true, isGeneric: false,
    requestCount: 0, connectHref: '/api/integrations/zoom/install',
    isConnected: false, syncHref: '/api/integrations/zoom/sync',
  },
  {
    slug: 'jira', displayName: 'Jira', category: 'Engineering',
    description: 'Track ticket-based decisions, approvals, scope changes and change request workflows.',
    websiteUrl: 'https://www.atlassian.com/software/jira', status: 'AVAILABLE', isNative: true, isGeneric: false,
    requestCount: 0, connectHref: '/api/integrations/jira/install',
    isConnected: false, syncHref: '/api/integrations/jira/sync',
  },
  {
    slug: 'servicenow', displayName: 'ServiceNow', category: 'ITSM',
    description: 'Capture change, CAB, procurement, access request, and workflow approvals from ServiceNow.',
    websiteUrl: 'https://www.servicenow.com', status: 'AVAILABLE', isNative: true, isGeneric: false,
    requestCount: 0, connectHref: '/api/integrations/servicenow/install',
    isConnected: false, syncHref: '/api/integrations/servicenow/sync',
  },
  {
    slug: 'salesforce', displayName: 'Salesforce', category: 'CRM',
    description: 'Capture opportunity approvals, quote sign-offs, contract approvals and deal desk decisions.',
    websiteUrl: 'https://salesforce.com', status: 'COMING_SOON', isNative: false, isGeneric: false,
    requestCount: 0, isConnected: false,
  },
  {
    slug: 'hubspot', displayName: 'HubSpot', category: 'CRM',
    description: 'Track deal approvals, quote sign-offs and customer agreement evidence from HubSpot.',
    websiteUrl: 'https://hubspot.com', status: 'COMING_SOON', isNative: false, isGeneric: false,
    requestCount: 0, isConnected: false,
  },
  {
    slug: 'sap', displayName: 'SAP', category: 'ERP',
    description: 'Ingest purchase order approvals, goods receipt sign-offs and financial authorizations.',
    websiteUrl: 'https://www.sap.com', status: 'COMING_SOON', isNative: false, isGeneric: false,
    requestCount: 0, isConnected: false,
  },
  {
    slug: 'workday', displayName: 'Workday', category: 'HR',
    description: 'Capture HR workflow approvals, headcount decisions and compensation approval evidence.',
    websiteUrl: 'https://workday.com', status: 'COMING_SOON', isNative: false, isGeneric: false,
    requestCount: 0, isConnected: false,
  },
  {
    slug: 'coupa', displayName: 'Coupa', category: 'Procurement',
    description: 'Capture purchase requisition, contract and supplier approval evidence from Coupa.',
    websiteUrl: 'https://coupa.com', status: 'COMING_SOON', isNative: false, isGeneric: false,
    requestCount: 0, isConnected: false,
  },
  {
    slug: 'docusign', displayName: 'DocuSign', category: 'Legal',
    description: 'Capture electronic signature completion events as auditable approval evidence.',
    websiteUrl: 'https://docusign.com', status: 'COMING_SOON', isNative: false, isGeneric: false,
    requestCount: 0, isConnected: false,
  },
  {
    slug: 'github', displayName: 'GitHub', category: 'Engineering',
    description: 'Capture PR reviews, code approvals, release authorizations and security sign-offs.',
    websiteUrl: 'https://github.com', status: 'BETA', isNative: false, isGeneric: false,
    requestCount: 0, isConnected: false,
  },
];

// ── OAuth notice helper ───────────────────────────────────────────────────────

type OAuthProvider = 'Slack' | 'Gmail' | 'Outlook' | 'Microsoft Teams' | 'Jira' | 'ServiceNow' | 'Zoom';

function oauthMessage(provider: OAuthProvider, status?: string, reason?: string) {
  if (status === 'connected') {
    return {
      tone: 'success' as const,
      title: `${provider} connected`,
      body: `${provider} authorization succeeded. ApprovLine is ready to capture read-only approval evidence.`,
    };
  }
  if (status === 'synced') {
    return {
      tone: 'success' as const,
      title: `${provider} synced`,
      body: `${provider} approval evidence was synced into the ApprovLine intelligence pipeline.`,
    };
  }
  if (status !== 'error') return null;

  const messages: Record<string, string> = {
    access_denied: `${provider} installation was canceled before ApprovLine received authorization.`,
    missing_oauth_code_or_state: `${provider} did not return the required OAuth code or state. Start the install again from this page.`,
    invalid_oauth_state: `The ${provider} install session expired or did not match this organization. Start the install again.`,
    missing_workspace_token: `${provider} did not return a workspace token. Confirm scopes and OAuth settings.`,
    missing_google_account_profile: 'Google did not return an email profile. Confirm profile and email scopes are enabled.',
    missing_outlook_profile: 'Microsoft did not return an Outlook or Exchange mailbox profile. Confirm Microsoft Graph User.Read and Mail.Read permissions are granted.',
    missing_microsoft_profile: 'Microsoft did not return an organizational user profile. Confirm Microsoft Graph User.Read permission is granted.',
    outlook_database_migration_required: 'Outlook connected at Microsoft, but ApprovLine production database needs the Outlook migration. Run npm run db:deploy, then reconnect Outlook.',
    missing_jira_site: 'Atlassian did not return a Jira site. Confirm this account has access to a Jira Cloud workspace.',
    jira_integration_missing: 'Jira is not connected for this workspace yet. Connect Jira first, then sync.',
    jira_database_migration_required: 'Jira connected at Atlassian, but ApprovLine production database needs the latest migration. Run npm run db:deploy, then reconnect Jira.',
    missing_servicenow_instance: 'ServiceNow needs an instance URL. Add SERVICENOW_INSTANCE_URL in Vercel, for example https://your-instance.service-now.com.',
    servicenow_integration_missing: 'ServiceNow is not connected for this workspace yet. Connect ServiceNow first, then sync.',
    servicenow_database_migration_required: 'ServiceNow connected, but ApprovLine production database needs the ServiceNow migration. Run npm run db:deploy, then reconnect ServiceNow.',
    missing_zoom_account: 'Zoom did not return an account or user profile. Confirm user:read scope is enabled, then reconnect Zoom.',
    zoom_integration_missing: 'Zoom is not connected for this workspace yet. Connect Zoom first, then sync.',
    zoom_database_migration_required: 'Zoom connected, but ApprovLine production database needs the Zoom migration. Run npm run db:deploy, then reconnect Zoom.',
  };

  return {
    tone: 'error' as const,
    title: `${provider} connection failed`,
    body: messages[reason ?? ''] ?? reason ?? `${provider} OAuth failed. Confirm credentials and redirect URL, then try again.`,
  };
}

function metadataValue(metadata: Prisma.JsonValue | null | undefined, key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const val = (metadata as Record<string, unknown>)[key];
  return typeof val === 'string' ? val : null;
}

// ── Sidebar sub-components ────────────────────────────────────────────────────

type SidebarStat = { label: string; value: number; color: string };

function StatPill({ label, value, color }: SidebarStat) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        <span className="text-sm font-semibold text-slate-700">{label}</span>
      </div>
      <span className="text-base font-black tabular-nums text-slate-950">{value}</span>
    </div>
  );
}

type MiniRequest = {
  id: string;
  providerName: string;
  category: string | null;
  priority: string;
  status: string;
  createdAt: Date;
};

function requestStatusBadge(s: string): string {
  switch (s) {
    case 'PENDING': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'UNDER_REVIEW': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'PLANNED': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'IN_DEVELOPMENT': return 'bg-violet-50 text-violet-700 border-violet-200';
    default: return 'bg-slate-50 text-slate-500 border-slate-200';
  }
}

// ── Generic connector sidebar items ──────────────────────────────────────────

const GENERIC_CONNECTORS = [
  {
    slug: 'webhook', name: 'Webhook Connector',
    desc: 'POST signed JSON from any system',
    icon: '⬡', color: 'bg-violet-50 text-violet-600',
    href: '/dashboard/gateway?tab=data-flow',
  },
  {
    slug: 'api', name: 'REST API Connector',
    desc: 'API key authenticated submission',
    icon: '{ }', color: 'bg-sky-50 text-sky-600',
    href: '/dashboard/gateway?tab=data-flow',
  },
  {
    slug: 'email', name: 'Email Ingestion',
    desc: 'Forward approval emails to capture',
    icon: '@', color: 'bg-rose-50 text-rose-500',
    href: '/dashboard/gateway?tab=data-flow',
  },
  {
    slug: 'csv', name: 'CSV / Data Import',
    desc: 'Bulk import historical records',
    icon: '⊞', color: 'bg-emerald-50 text-emerald-600',
    href: '/dashboard/gateway?tab=data-flow',
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    slack?: string; gmail?: string; outlook?: string; teams?: string;
    jira?: string; servicenow?: string; zoom?: string; reason?: string;
  }>;
}) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (tenant.user) enforcePageRole('/dashboard/settings', tenant.user.role);

  const query = await searchParams;

  // ── Data fetching ──────────────────────────────────────────────────────────

  let integrations: Awaited<ReturnType<typeof prisma.integration.findMany>> = [];
  let dbProviders: Array<{
    slug: string; displayName: string; category: string; description: string;
    websiteUrl: string | null; status: string; isNative: boolean;
    requestCount: number;
  }> = [];
  let myRequests: MiniRequest[] = [];
  let statusNotice: string | null = null;

  if (tenant.organization) {
    try {
      [integrations, dbProviders, myRequests] = await withTimeout(
        'integrations-page-fetch',
        Promise.all([
          prisma.integration.findMany({
            where: { organizationId: tenant.organization.id },
            orderBy: { provider: 'asc' },
          }),
          prisma.marketplaceProvider.findMany({
            where: { status: { in: ['AVAILABLE', 'BETA', 'COMING_SOON'] } },
            orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
            select: {
              slug: true, displayName: true, category: true, description: true,
              websiteUrl: true, status: true, isNative: true, requestCount: true,
            },
          }),
          prisma.integrationRequest.findMany({
            where: { organizationId: tenant.organization.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true, providerName: true, category: true,
              priority: true, status: true, createdAt: true,
            },
          }),
        ]),
        4000,
      );
    } catch (error) {
      console.warn('[integrations-page] fetch failed', error);
      statusNotice = 'Integration status is refreshing. Connector cards remain available.';
    }
  } else if (tenant.status === 'error' || tenant.status === 'database_invalid') {
    statusNotice = 'Integration status is refreshing. Connector cards remain available.';
  }

  // ── Build ShellProvider list ───────────────────────────────────────────────

  // Build connected slugs from Integration rows
  const integrationByProvider = new Map(integrations.map((i) => [i.provider, i]));
  const connectedSlugs = new Set(
    integrations
      .filter((i) => i.status === 'CONNECTED' || i.status === 'SYNCING' || i.status === 'ERROR' || i.status === 'NEEDS_REAUTH')
      .map((i) => PROVIDER_TO_SLUG[i.provider] ?? i.provider.toLowerCase()),
  );

  const GENERIC_SLUGS = new Set(['webhook', 'api', 'csv', 'email_capture']);

  let shellProviders: ShellProvider[];

  if (dbProviders.length > 0) {
    // DB has provider catalog — use it
    shellProviders = dbProviders
      .filter((p) => !GENERIC_SLUGS.has(p.slug))
      .map((p): ShellProvider => {
        const isConnected = connectedSlugs.has(p.slug);
        const providerEnumKey = Object.entries(PROVIDER_TO_SLUG).find(([, slug]) => slug === p.slug)?.[0];
        const integration = isConnected && providerEnumKey
          ? integrationByProvider.get(providerEnumKey as IntegrationProvider)
          : undefined;
        const lastSyncAt =
          metadataValue(integration?.metadata ?? null, 'lastSyncAt') ??
          metadataValue(integration?.metadata ?? null, 'lastEventAt') ??
          null;
        return {
          slug: p.slug,
          displayName: p.displayName,
          category: p.category,
          description: p.description,
          websiteUrl: p.websiteUrl,
          status: p.status as ShellProvider['status'],
          isNative: p.isNative,
          isGeneric: GENERIC_SLUGS.has(p.slug),
          requestCount: p.requestCount,
          connectHref: SLUG_TO_CONNECT_HREF[p.slug],
          isConnected,
          integrationId: integration?.id,
          integrationStatus: integration?.status,
          lastSyncAt,
          syncHref: SLUG_TO_SYNC_HREF[p.slug],
          disconnectHref: SLUG_TO_DISCONNECT_HREF[p.slug],
        };
      });
  } else {
    // Fall back to static list and hydrate with connection status
    shellProviders = STATIC_PROVIDERS.map((p): ShellProvider => {
      const isConnected = connectedSlugs.has(p.slug);
      const providerEnumKey = Object.entries(PROVIDER_TO_SLUG).find(([, slug]) => slug === p.slug)?.[0];
      const integration = isConnected && providerEnumKey
        ? integrationByProvider.get(providerEnumKey as IntegrationProvider)
        : undefined;
      const lastSyncAt =
        metadataValue(integration?.metadata ?? null, 'lastSyncAt') ??
        metadataValue(integration?.metadata ?? null, 'lastEventAt') ??
        null;
      return {
        ...p,
        isConnected,
        integrationId: integration?.id,
        integrationStatus: integration?.status,
        lastSyncAt,
      };
    });
  }

  // ── Sidebar stats ─────────────────────────────────────────────────────────

  const connectedCount = integrations.filter(
    (i) => i.status === 'CONNECTED' || i.status === 'SYNCING',
  ).length;
  const availableCount = shellProviders.filter(
    (p) => !p.isConnected && p.status === 'AVAILABLE' && p.isNative,
  ).length;
  const betaCount = shellProviders.filter((p) => p.status === 'BETA').length;
  const requestedCount = myRequests.filter((r) =>
    ['PENDING', 'UNDER_REVIEW', 'PLANNED', 'IN_DEVELOPMENT'].includes(r.status),
  ).length;

  const sidebarRequests = myRequests.slice(0, 5);

  // ── ShellRequest ─────────────────────────────────────────────────────────

  const shellRequests: ShellRequest[] = myRequests.map((r) => ({
    id: r.id,
    providerName: r.providerName,
    category: r.category,
    priority: r.priority,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));

  // ── OAuth notices ─────────────────────────────────────────────────────────

  const notices = [
    oauthMessage('Slack', query.slack, query.reason),
    oauthMessage('Gmail', query.gmail, query.reason),
    oauthMessage('Outlook', query.outlook, query.reason),
    oauthMessage('Microsoft Teams', query.teams, query.reason),
    oauthMessage('Jira', query.jira, query.reason),
    oauthMessage('ServiceNow', query.servicenow, query.reason),
    oauthMessage('Zoom', query.zoom, query.reason),
  ].filter(Boolean);

  const orgSlug = tenant.organization?.slug ?? '';
  const appUrl = process.env.APP_URL ?? 'https://approvline.ai';

  return (
    <section className="mx-auto w-full max-w-[88rem] pb-10">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Integrations</h1>
          <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            Connect ApprovLine to the tools where your organization works and decisions happen.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            href="/dashboard/gateway?tab=data-flow"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Generic Connector
          </a>
          <RequestIntegrationButton />
        </div>
      </div>

      {/* ── Notices ──────────────────────────────────────────────────────── */}
      {statusNotice && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-600 shadow-sm">
          <p className="font-black text-slate-950">Status refresh delayed</p>
          <p className="mt-1">{statusNotice}</p>
        </div>
      )}
      {notices.map((n) => (
        <div
          key={n!.title}
          className={`mb-4 rounded-2xl border p-4 shadow-sm ${
            n!.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <p className="font-black">{n!.title}</p>
          <p className="mt-1 text-sm">{n!.body}</p>
        </div>
      ))}

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:gap-8">
        {/* Main content */}
        <div className="min-w-0 flex-1">
          <IntegrationsClientShell providers={shellProviders} myRequests={shellRequests} />
        </div>

        {/* Right sidebar */}
        <aside className="w-full shrink-0 xl:w-72 xl:sticky xl:top-6">
          <div className="flex flex-col gap-4">
            {/* Your Connections */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-black tracking-tight text-slate-950">Your Connections</h2>
              <div className="flex flex-col gap-3">
                <StatPill label="Connected" value={connectedCount} color="bg-emerald-400" />
                <StatPill label="Available" value={availableCount} color="bg-blue-400" />
                <StatPill label="Beta" value={betaCount} color="bg-violet-400" />
                <StatPill label="Requested" value={requestedCount} color="bg-amber-400" />
              </div>
            </div>

            {/* Integration Requests */}
            {sidebarRequests.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-black text-slate-950">Integration Requests</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600">
                    {sidebarRequests.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {sidebarRequests.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-slate-800">{r.providerName}</p>
                        <p className="text-[10px] text-slate-400">
                          Requested {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${requestStatusBadge(r.status)}`}>
                        {r.status === 'UNDER_REVIEW' ? 'Review' : r.status === 'IN_DEVELOPMENT' ? 'Building' : r.status.toLowerCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generic Connectors */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-1 text-sm font-black text-slate-950">Generic Connectors</h2>
              <p className="mb-3 text-xs font-semibold text-slate-500">
                Connect tools using webhooks, APIs, email ingestion or data import.
              </p>
              <div className="flex flex-col gap-2">
                {GENERIC_CONNECTORS.map((gc) => (
                  <Link
                    key={gc.slug}
                    href={gc.href}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs transition hover:border-slate-200 hover:bg-white"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-black ${gc.color}`}>
                        {gc.icon}
                      </span>
                      <span className="truncate font-black text-slate-800">{gc.name}</span>
                    </div>
                    <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                    </svg>
                  </Link>
                ))}
              </div>
              <Link
                href="/dashboard/gateway"
                className="mt-3 block text-center text-xs font-black text-[#2155d9] hover:underline"
              >
                Learn more about integrations →
              </Link>
            </div>

            {/* Can't find your tool? */}
            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
              <p className="text-sm font-black text-violet-950">Can&apos;t find your tool?</p>
              <p className="mt-1 text-xs font-semibold text-violet-700">
                Request an integration or use a generic connector to bring your approval data into ApprovLine.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <a
                  href="/dashboard/gateway?tab=data-flow"
                  className="block rounded-lg border border-violet-200 bg-white px-3 py-2 text-center text-xs font-black text-violet-700 transition hover:bg-violet-50"
                >
                  Use generic connector
                </a>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
