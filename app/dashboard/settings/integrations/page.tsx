import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getDashboardTenant } from '@/lib/auth';
import { withTimeout } from '@/lib/performance';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type IntegrationCard = {
  key: string;
  provider?: 'GMAIL' | 'SLACK' | 'MICROSOFT_TEAMS' | 'ZOOM';
  name: string;
  description: string;
  icon: string;
  iconClass: string;
  href?: string;
};

type IntegrationSection = {
  title: string;
  cards: IntegrationCard[];
};

const sections: IntegrationSection[] = [
  {
    title: 'Email',
    cards: [
      {
        key: 'gmail',
        provider: 'GMAIL',
        name: 'Gmail',
        description: 'Capture decisions from email threads and approval chains',
        icon: 'G',
        iconClass: 'bg-rose-50 text-rose-600',
        href: '/api/integrations/gmail/install',
      },
      {
        key: 'outlook',
        name: 'Outlook',
        description: 'Sync decision emails from Microsoft Outlook and Exchange',
        icon: 'O',
        iconClass: 'bg-blue-50 text-blue-600',
      },
    ],
  },
  {
    title: 'Messaging',
    cards: [
      {
        key: 'slack',
        provider: 'SLACK',
        name: 'Slack',
        description: 'Track decisions made in Slack channels, DMs and huddles',
        icon: 'S',
        iconClass: 'bg-purple-50 text-purple-600',
        href: '/api/integrations/slack/install',
      },
      {
        key: 'teams',
        provider: 'MICROSOFT_TEAMS',
        name: 'Microsoft Teams',
        description: 'Capture decisions from Teams meetings, channels and chats',
        icon: 'T',
        iconClass: 'bg-indigo-50 text-indigo-600',
      },
      {
        key: 'whatsapp',
        name: 'WhatsApp',
        description: 'Log business decisions shared via WhatsApp Business',
        icon: 'W',
        iconClass: 'bg-emerald-50 text-emerald-600',
      },
    ],
  },
  {
    title: 'Meetings',
    cards: [
      {
        key: 'zoom',
        provider: 'ZOOM',
        name: 'Zoom',
        description: 'Automatically extract decisions from Zoom meeting transcripts',
        icon: 'Z',
        iconClass: 'bg-sky-50 text-sky-600',
      },
    ],
  },
  {
    title: 'Project Management',
    cards: [
      {
        key: 'jira',
        name: 'Jira',
        description: 'Track ticket-based decisions, approvals and scope changes',
        icon: 'J',
        iconClass: 'bg-blue-50 text-blue-700',
      },
      {
        key: 'asana',
        name: 'Asana',
        description: 'Capture task sign-offs and project decisions from Asana',
        icon: 'A',
        iconClass: 'bg-pink-50 text-pink-600',
      },
      {
        key: 'notion',
        name: 'Notion',
        description: 'Sync decisions documented in Notion pages and databases',
        icon: 'N',
        iconClass: 'bg-slate-100 text-slate-600',
      },
      {
        key: 'monday',
        name: 'Monday.com',
        description: 'Pull decisions and approvals from Monday.com boards and items',
        icon: 'M',
        iconClass: 'bg-orange-50 text-orange-600',
      },
    ],
  },
];

function oauthMessage(provider: 'Slack' | 'Gmail', status?: string, reason?: string) {
  if (status === 'connected') {
    return {
      tone: 'success',
      title: `${provider} connected`,
      body: `${provider} authorization succeeded. ApprovLine is ready to capture read-only approval evidence.`,
    };
  }
  if (status !== 'error') return null;

  const messages: Record<string, string> = {
    access_denied: `${provider} installation was canceled before ApprovLine received authorization.`,
    missing_oauth_code_or_state: `${provider} did not return the required OAuth code or state. Start the install again from this page.`,
    invalid_oauth_state: `The ${provider} install session expired or did not match this organization. Start the install again.`,
    missing_workspace_token: `${provider} did not return a workspace token. Confirm scopes and OAuth settings.`,
    missing_google_account_profile: 'Google did not return an email profile. Confirm profile and email scopes are enabled.',
  };
  return {
    tone: 'error',
    title: `${provider} connection failed`,
    body: messages[reason ?? ''] ?? reason ?? `${provider} OAuth failed. Confirm credentials and redirect URL, then try again.`,
  };
}

function toggleVisual(connected: boolean) {
  return (
    <span className="flex shrink-0 items-center gap-3" aria-hidden="true">
      <span className={`h-5 w-5 rounded-full border-2 ${connected ? 'border-[#2155d9]' : 'border-slate-300'}`} />
      <span className={`relative h-8 w-14 rounded-full p-1 shadow-sm transition ${connected ? 'bg-[#2155d9]' : 'bg-slate-300'}`}>
        <span className={`block h-6 w-6 rounded-full bg-white shadow-sm transition ${connected ? 'translate-x-6' : 'translate-x-0'}`} />
      </span>
    </span>
  );
}

function IntegrationTile({
  card,
  status,
}: {
  card: IntegrationCard;
  status: string;
}) {
  const connected = status === 'CONNECTED' || status === 'SYNCING';
  const disabled = !card.href && !connected;
  const content = (
    <div
      className={`group flex min-h-[148px] items-start justify-between gap-6 rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_2px_10px_rgba(15,23,42,0.08)] transition ${
        disabled ? 'opacity-95' : 'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_32px_rgba(15,23,42,0.12)]'
      }`}
    >
      <div className="flex min-w-0 gap-6">
        <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-black ${card.iconClass}`}>
          {card.icon}
        </span>
        <span>
          <span className="block text-xl font-black tracking-tight text-slate-950">{card.name}</span>
          <span className="mt-2 block max-w-md text-lg font-semibold leading-8 text-slate-500">{card.description}</span>
          {connected ? (
            <span className="mt-4 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700">
              Connected
            </span>
          ) : card.href ? (
            <span className="mt-4 inline-flex text-xs font-black uppercase tracking-wide text-[#2155d9]">Click to connect</span>
          ) : (
            <span className="mt-4 inline-flex text-xs font-black uppercase tracking-wide text-slate-400">Coming soon</span>
          )}
        </span>
      </div>
      {toggleVisual(connected)}
    </div>
  );

  if (card.href && !connected) {
    return (
      <Link href={card.href} className="block focus:outline-none focus:ring-4 focus:ring-blue-100">
        {content}
      </Link>
    );
  }

  return content;
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ slack?: string; gmail?: string; reason?: string }>;
}) {
  const tenant = await getDashboardTenant(1500);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  const query = await searchParams;
  let loadError: string | null = null;
  let integrations: Awaited<ReturnType<typeof prisma.integration.findMany>> = [];

  try {
    if (!tenant.organization) throw new Error(tenant.error ?? 'Workspace unavailable.');
    integrations = await withTimeout(
      'dashboard integrations list',
      prisma.integration.findMany({
        where: { organizationId: tenant.organization.id },
        orderBy: { provider: 'asc' },
      }),
      1200,
    );
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load integration status.';
  }

  const statusByProvider = new Map(integrations.map((item) => [item.provider, item.status]));
  const slackNotice = oauthMessage('Slack', query.slack, query.reason);
  const gmailNotice = oauthMessage('Gmail', query.gmail, query.reason);

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-10 pb-10">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2155d9]">Integrations</p>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Connect approval sources</h2>
        <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-500">
          Choose where ApprovLine should capture decisions. Gmail and Slack are available now; the rest are staged for rollout.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm">
          <h3 className="font-black">Unable to load integration status</h3>
          <p className="mt-1 text-sm">Connector cards are still available. Status will refresh on retry.</p>
          <p className="mt-2 rounded-lg bg-white/70 p-2 text-xs font-semibold">{loadError}</p>
        </div>
      ) : null}

      {[slackNotice, gmailNotice].filter(Boolean).map((notice) => (
        <div
          key={notice!.title}
          className={`rounded-2xl border p-4 shadow-sm ${
            notice!.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <h3 className="font-black">{notice!.title}</h3>
          <p className="mt-1 text-sm">{notice!.body}</p>
        </div>
      ))}

      {sections.map((section) => (
        <div key={section.title} className="grid gap-5">
          <h3 className="text-xl font-black uppercase tracking-[0.08em] text-slate-500">{section.title}</h3>
          <div className="grid gap-5 lg:grid-cols-2">
            {section.cards.map((card) => (
              <IntegrationTile
                key={card.key}
                card={card}
                status={card.provider ? statusByProvider.get(card.provider) ?? 'NOT_CONNECTED' : 'NOT_CONNECTED'}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
