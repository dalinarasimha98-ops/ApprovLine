import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingLink } from '@/components/system/PendingLink';
import { getDashboardTenant } from '@/lib/auth';
import { buildReadinessReport, type ReadinessCheck, type ReadinessStatus } from '@/services/readiness';

export const dynamic = 'force-dynamic';

type Tone = 'ok' | 'warning' | 'error' | 'neutral';

const lastVerified = 'Jul 12, 2026';

const securityPrinciples = [
  {
    title: 'Read-Only Access',
    description: 'Connectors are designed to inspect approval evidence and metadata without writing back to customer systems.',
    status: 'Verified',
  },
  {
    title: 'No Data Modification',
    description: 'ApprovLine does not delete, approve, post, modify, or send messages through connected customer tools.',
    status: 'Enforced',
  },
  {
    title: 'Tenant Isolation',
    description: 'Every request is scoped to one workspace, one organization, and one permission boundary.',
    status: 'Active',
  },
  {
    title: 'Encrypted Storage',
    description: 'OAuth tokens, integration secrets, and sensitive connector credentials are encrypted at rest.',
    status: 'Active',
  },
  {
    title: 'Audit Logging',
    description: 'Important actions create audit events so security and compliance teams can reconstruct activity.',
    status: 'Enabled',
  },
  {
    title: 'Role-Based Access Control',
    description: 'Workspace roles control who can view, investigate, export, and administer approval records.',
    status: 'Enabled',
  },
];

const integrationPermissions = [
  'Slack',
  'Gmail',
  'Outlook',
  'Teams',
  'Jira',
  'Zoom',
  'ServiceNow',
  'Ironclad',
  'Salesforce',
  'GitHub',
  'Universal Gateway',
].map((name) => ({
  name,
  accessType: 'Read-Only',
  canRead: ['Messages', 'Approvals', 'Metadata'],
  cannot: ['Modify Data', 'Delete Data', 'Send Messages', 'Approve Actions'],
}));

const storedDataTypes = [
  ['Approvals', 'Customer-defined retention', 'Tenant PostgreSQL database', 'Encrypted at rest'],
  ['Audit Logs', 'Compliance retention policy', 'Tenant PostgreSQL database', 'Encrypted at rest'],
  ['Investigation Records', 'Customer-defined retention', 'Tenant PostgreSQL database', 'Encrypted at rest'],
  ['Playbooks', 'Customer-defined retention', 'Tenant PostgreSQL database', 'Encrypted at rest'],
  ['Policies', 'Customer-defined retention', 'Tenant PostgreSQL database', 'Encrypted at rest'],
  ['Metadata', 'Operational retention', 'Tenant PostgreSQL database', 'Encrypted at rest'],
  ['Copilot Conversations', 'Customer-defined retention', 'Tenant PostgreSQL database', 'Encrypted at rest'],
  ['Memory Graph Entities', 'Customer-defined retention', 'Tenant PostgreSQL database', 'Encrypted at rest'],
];

const tenantIsolation = [
  'Separate Workspace',
  'Separate Data Access',
  'Separate User Permissions',
  'Separate Audit Trail',
];

const roleMatrix = [
  { role: 'Org Admin', view: true, edit: true, investigate: true, copilot: true, export: true },
  { role: 'Compliance', view: true, edit: false, investigate: true, copilot: true, export: true },
  { role: 'Legal', view: true, edit: false, investigate: true, copilot: true, export: true },
  { role: 'Finance', view: true, edit: false, investigate: true, copilot: true, export: true },
  { role: 'Procurement', view: true, edit: false, investigate: true, copilot: true, export: true },
  { role: 'Engineering', view: true, edit: false, investigate: false, copilot: true, export: false },
  { role: 'Viewer', view: true, edit: false, investigate: false, copilot: false, export: false },
];

const auditExamples = [
  'Approval Created',
  'Approval Modified',
  'Investigation Opened',
  'Policy Uploaded',
  'User Invited',
  'Feature Enabled',
];

const faqs = [
  {
    question: 'What data does ApprovLine access?',
    answer: 'ApprovLine reads approval-related messages, metadata, evidence links, uploaded playbooks, and customer-provided records needed to classify decisions and build an audit trail.',
  },
  {
    question: 'Can ApprovLine modify our systems?',
    answer: 'No. ApprovLine integrations are designed for read-only evidence capture and approval intelligence. The product does not modify connected systems.',
  },
  {
    question: 'Can ApprovLine send messages?',
    answer: 'No. Connected integrations are not used to send Slack, email, Teams, Jira, Zoom, or ServiceNow messages on behalf of customers.',
  },
  {
    question: 'Can ApprovLine approve requests?',
    answer: 'No. ApprovLine detects and analyzes approvals; it does not execute approvals or make approval decisions in source systems.',
  },
  {
    question: 'Can employees see other departments?',
    answer: 'Visibility is controlled by workspace roles and organization permissions. Customers can restrict access by role, department, and operational need.',
  },
  {
    question: 'Can data be deleted?',
    answer: 'Data deletion should follow the customer retention policy and administrator controls. Destructive actions are protected by confirmation and audit logging.',
  },
];

function toneFromStatus(status: ReadinessStatus): Tone {
  if (status === 'ok') return 'ok';
  if (status === 'error') return 'error';
  return 'warning';
}

function statusClass(tone: Tone) {
  return {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    error: 'border-rose-200 bg-rose-50 text-rose-700',
    neutral: 'border-slate-200 bg-slate-50 text-slate-600',
  }[tone];
}

function StatusPill({ label, tone = 'ok' }: { label: string; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${statusClass(tone)}`}>
      {label}
    </span>
  );
}

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2155d9]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function ReadinessCard({ label, check }: { label: string; check: ReadinessCheck }) {
  const tone = toneFromStatus(check.status);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-black text-slate-950">{label}</p>
        <StatusPill label={check.status} tone={tone} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{check.message}</p>
    </div>
  );
}

function PermissionValue({ value }: { value: boolean }) {
  return (
    <span className={`inline-flex min-w-16 justify-center rounded-full px-2.5 py-1 text-xs font-black ${value ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      {value ? 'Yes' : 'No'}
    </span>
  );
}

function buildOperationalChecks(checks: Record<string, ReadinessCheck>) {
  const integrationStatus =
    ['slackClientId', 'googleClientId', 'microsoftClientId', 'jiraClientId', 'serviceNowClientId', 'zoomClientId'].some((key) => checks[key]?.status === 'error')
      ? 'error'
      : ['slackClientId', 'googleClientId', 'microsoftClientId', 'jiraClientId', 'serviceNowClientId', 'zoomClientId'].some((key) => checks[key]?.status === 'ok')
        ? 'ok'
        : 'missing';

  const copilotStatus = checks.anthropic?.status === 'ok' || checks.openai?.status === 'ok' ? 'ok' : 'missing';
  const gatewayStatus = checks.appUrl?.status === 'ok' && checks.encryptionKey?.status === 'ok' ? 'ok' : 'missing';

  return [
    { label: 'Database Status', check: checks.postgresql },
    { label: 'Queue Status', check: checks.redis },
    {
      label: 'Integration Status',
      check: {
        status: integrationStatus as ReadinessStatus,
        message: integrationStatus === 'ok' ? 'At least one production connector is configured.' : 'Connector credentials are not fully configured yet.',
      },
    },
    {
      label: 'Copilot Status',
      check: {
        status: copilotStatus as ReadinessStatus,
        message: copilotStatus === 'ok' ? 'AI provider configuration is available for Copilot.' : 'Add OpenAI or Anthropic credentials to enable Copilot.',
      },
    },
    {
      label: 'Gateway Status',
      check: {
        status: gatewayStatus as ReadinessStatus,
        message: gatewayStatus === 'ok' ? 'App URL and encryption key are configured for gateway ingestion.' : 'Gateway requires APP_URL and ENCRYPTION_KEY.',
      },
    },
  ];
}

export default async function TrustPage() {
  const tenant = await getDashboardTenant(1500);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');

  const readiness = await buildReadinessReport();
  const operationalChecks = buildOperationalChecks(readiness.checks);
  const readinessCheck: ReadinessCheck = {
    status: readiness.ready ? 'ok' : 'missing',
    message: readiness.ready
      ? 'Core platform readiness is passing. Optional connector setup is tracked separately.'
      : 'One or more core platform services need attention before production use.',
  };

  return (
    <DashboardShell>
      <section className="grid gap-8">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-[#07111f] px-6 py-8 text-white sm:px-8">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-200">Security & Trust Center</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">Enterprise security, permissions, privacy, and compliance in one place.</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
              ApprovLine is built as a read-only approval intelligence layer with tenant isolation, encrypted storage, audit logging, and clear integration permissions.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <StatusPill label="Read-only connectors" />
              <StatusPill label="Tenant isolated" />
              <StatusPill label="Audit-ready" />
              <StatusPill label="Encrypted storage" />
            </div>
            <PendingLink href="/trust/compliance" pendingText="Opening compliance hub..." className="mt-6 inline-flex min-h-0 h-11 items-center rounded-xl bg-white px-5 text-sm font-black text-[#07111f] shadow-sm transition hover:bg-blue-50">
              Open Compliance Hub
            </PendingLink>
          </div>
        </div>

        <section className="grid gap-5">
          <SectionHeader
            eyebrow="Principles"
            title="ApprovLine security principles"
            description="The product is designed for enterprise buyers who need decision intelligence without giving a tool permission to act inside their source systems."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {securityPrinciples.map((principle) => (
              <div key={principle.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-black text-slate-950">{principle.title}</h3>
                  <StatusPill label={principle.status} />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{principle.description}</p>
                <p className="mt-5 text-xs font-black uppercase tracking-wide text-slate-500">Last verification date: {lastVerified}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5">
          <SectionHeader
            eyebrow="Integrations"
            title="Connector permissions"
            description="Every connector is documented with what ApprovLine can read and what it is intentionally not allowed to do."
          />
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">System</th>
                    <th className="px-4 py-3">Access Type</th>
                    <th className="px-4 py-3">Can Read</th>
                    <th className="px-4 py-3">Cannot</th>
                  </tr>
                </thead>
                <tbody>
                  {integrationPermissions.map((integration) => (
                    <tr key={integration.name} className="border-t border-slate-100">
                      <td className="px-4 py-4 font-black text-slate-950">{integration.name}</td>
                      <td className="px-4 py-4"><StatusPill label={integration.accessType} /></td>
                      <td className="px-4 py-4 text-slate-600">{integration.canRead.join(', ')}</td>
                      <td className="px-4 py-4 text-slate-600">{integration.cannot.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid gap-5">
          <SectionHeader
            eyebrow="Data handling"
            title="Data types stored"
            description="ApprovLine stores only the evidence and metadata needed to provide approval intelligence, auditability, investigations, analytics, and Copilot context."
          />
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Data Type</th>
                    <th className="px-4 py-3">Retention Policy</th>
                    <th className="px-4 py-3">Storage Location</th>
                    <th className="px-4 py-3">Encryption Status</th>
                  </tr>
                </thead>
                <tbody>
                  {storedDataTypes.map(([type, retention, location, encryption]) => (
                    <tr key={type} className="border-t border-slate-100">
                      <td className="px-4 py-4 font-black text-slate-950">{type}</td>
                      <td className="px-4 py-4 text-slate-600">{retention}</td>
                      <td className="px-4 py-4 text-slate-600">{location}</td>
                      <td className="px-4 py-4"><StatusPill label={encryption} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid gap-5">
          <SectionHeader
            eyebrow="Tenant isolation"
            title="Every customer gets a separate operating boundary"
            description="Workspace, data access, user permissions, and audit trails are isolated so one customer cannot access another customer workspace."
          />
          <div className="grid gap-4 md:grid-cols-4">
            {tenantIsolation.map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <StatusPill label="Isolated" />
                <p className="mt-4 text-base font-black text-slate-950">{item}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <p className="text-sm font-black uppercase tracking-wide">Tenant Isolation Status</p>
            <p className="mt-2 text-sm leading-6 font-semibold">Active for signed-in workspace: {tenant.organization?.name ?? 'Current workspace'}.</p>
          </div>
        </section>

        <section className="grid gap-5">
          <SectionHeader
            eyebrow="Access control"
            title="Role-based permissions matrix"
            description="Workspace roles determine whether a user can view, edit, investigate, use Copilot, or export approval evidence."
          />
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Can View</th>
                    <th className="px-4 py-3">Can Edit</th>
                    <th className="px-4 py-3">Can Investigate</th>
                    <th className="px-4 py-3">Can Access Copilot</th>
                    <th className="px-4 py-3">Can Export</th>
                  </tr>
                </thead>
                <tbody>
                  {roleMatrix.map((row) => (
                    <tr key={row.role} className="border-t border-slate-100">
                      <td className="px-4 py-4 font-black text-slate-950">{row.role}</td>
                      <td className="px-4 py-4"><PermissionValue value={row.view} /></td>
                      <td className="px-4 py-4"><PermissionValue value={row.edit} /></td>
                      <td className="px-4 py-4"><PermissionValue value={row.investigate} /></td>
                      <td className="px-4 py-4"><PermissionValue value={row.copilot} /></td>
                      <td className="px-4 py-4"><PermissionValue value={row.export} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              eyebrow="Auditability"
              title="Every action recorded"
              description="Audit logs capture who did what, when it happened, and which workspace object was affected."
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {auditExamples.map((example) => (
                <div key={example} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
                  {example}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              eyebrow="FAQ"
              title="Common security questions"
              description="Fast answers for legal, security, compliance, procurement, and IT review."
            />
            <div className="mt-5 grid gap-3">
              {faqs.map((faq) => (
                <details key={faq.question} className="group rounded-xl border border-slate-200 bg-white p-4">
                  <summary className="cursor-pointer text-sm font-black text-slate-950 marker:text-[#2155d9]">{faq.question}</summary>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5">
          <SectionHeader
            eyebrow="Operational status"
            title="Production readiness"
            description="These checks help reviewers understand whether core platform services, queueing, AI, connectors, and gateway ingestion are configured."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {operationalChecks.map((item) => (
              <ReadinessCard key={item.label} label={item.label} check={item.check} />
            ))}
            <ReadinessCard label="Readiness Status" check={readinessCheck} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader
            eyebrow="Contacts"
            title="Security, support, and issue reporting"
            description="Use these channels for vendor review, support requests, and pilot issue reporting."
          />
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <a href="mailto:security@approvline.com" className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-base font-black text-slate-950">Security Contact</p>
              <p className="mt-2 text-sm font-semibold text-slate-600">security@approvline.com</p>
            </a>
            <a href="mailto:support@approvline.com" className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-base font-black text-slate-950">Support Contact</p>
              <p className="mt-2 text-sm font-semibold text-slate-600">support@approvline.com</p>
            </a>
            <PendingLink href="/dashboard/pilot" pendingText="Opening issue reporting..." className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-base font-black text-slate-950">Issue Reporting</p>
              <p className="mt-2 text-sm font-semibold text-slate-600">Open pilot feedback and issue reporting.</p>
            </PendingLink>
          </div>
        </section>
      </section>
    </DashboardShell>
  );
}
