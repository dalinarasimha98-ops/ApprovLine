import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';
import { getDashboardTenant } from '@/lib/auth';
import { writeAuditLog } from '@/services/audit';
import { buildReadinessReport, type ReadinessStatus } from '@/services/readiness';

export const dynamic = 'force-dynamic';

type Tone = 'ok' | 'warning' | 'error' | 'neutral';

const reviewedAt = 'Jul 16, 2026';

const questionnaireLibrary = [
  {
    category: 'Data Storage',
    question: 'Where does ApprovLine store customer data?',
    answer: 'ApprovLine stores approval records, audit logs, investigations, playbooks, Copilot context, and Memory Graph metadata in tenant-scoped PostgreSQL storage with encrypted sensitive credentials.',
    owner: 'Security',
  },
  {
    category: 'Encryption',
    question: 'Is customer data encrypted?',
    answer: 'Sensitive integration tokens and credentials are encrypted before storage. Platform data is stored in managed infrastructure with encryption at rest and TLS in transit.',
    owner: 'Security',
  },
  {
    category: 'Authentication',
    question: 'How do users authenticate?',
    answer: 'Users authenticate through ApprovLine-supported identity flows including email, Google, Microsoft, and enterprise SSO preparation for SAML/OIDC identity providers.',
    owner: 'Identity',
  },
  {
    category: 'SSO',
    question: 'Does ApprovLine support enterprise SSO?',
    answer: 'The Identity Center is prepared for Microsoft Entra ID, Okta, Google Workspace, Generic SAML 2.0, and Generic OIDC configuration with future SCIM provisioning support.',
    owner: 'Identity',
  },
  {
    category: 'Access Control',
    question: 'How is access controlled inside a workspace?',
    answer: 'Workspace roles restrict who can view, investigate, export, administer, and use AI-assisted approval intelligence features.',
    owner: 'Product Security',
  },
  {
    category: 'Audit Logging',
    question: 'Are administrator actions audited?',
    answer: 'Important actions including integrations, identity changes, policy uploads, investigations, security requests, and founder operations create audit events.',
    owner: 'Compliance',
  },
  {
    category: 'Tenant Isolation',
    question: 'Can one customer access another customer workspace?',
    answer: 'No. ApprovLine scopes workspace data, users, permissions, and audit trails by organization so customers operate inside separate tenant boundaries.',
    owner: 'Security',
  },
  {
    category: 'Integrations',
    question: 'Can ApprovLine change data in connected systems?',
    answer: 'No. Integrations are designed for read-only evidence capture. ApprovLine does not delete, approve, modify, post, or send messages in connected systems.',
    owner: 'Integrations',
  },
  {
    category: 'AI Usage',
    question: 'How does ApprovLine use AI?',
    answer: 'AI is used to classify approvals, summarize investigations, answer Copilot questions, and evaluate policy guidance against customer-scoped evidence and playbooks.',
    owner: 'AI Governance',
  },
  {
    category: 'Data Retention',
    question: 'How long is customer data retained?',
    answer: 'Retention is customer-configurable by data type. Audit, investigation, playbook, Copilot, and Memory Graph retention can be aligned with customer policies.',
    owner: 'Compliance',
  },
  {
    category: 'Privacy',
    question: 'Does ApprovLine sell customer data?',
    answer: 'No. ApprovLine is built as an enterprise approval intelligence system and does not sell customer workspace data.',
    owner: 'Legal',
  },
  {
    category: 'Export Controls',
    question: 'Can customers export audit evidence?',
    answer: 'Yes. ApprovLine supports export workflows for approval records, audit logs, executive reports, and security review artifacts.',
    owner: 'Compliance',
  },
];

const securityFaq = [
  ['What data does ApprovLine store?', 'Approval evidence, source metadata, audit logs, investigation records, playbooks, policy summaries, Copilot conversations, Memory Graph entities, and integration connection state.'],
  ['Does ApprovLine modify customer systems?', 'No. The product is designed as a read-only evidence capture and approval intelligence layer.'],
  ['How is customer data protected?', 'ApprovLine uses tenant-scoped access, encrypted sensitive credentials, role controls, audit logging, and operational readiness checks.'],
  ['How is tenant isolation enforced?', 'Every product flow resolves the current organization before accessing workspace data, and records are scoped to that organization.'],
  ['How does AI Copilot access data?', 'Copilot answers from customer-scoped approval, policy, investigation, analytics, and Memory Graph context only.'],
  ['How are integrations secured?', 'OAuth tokens are encrypted, scopes are read-only where available, and integration activity is audited.'],
  ['What permissions are required?', 'Read-only permissions for the connected systems a customer chooses to authorize, plus workspace roles for ApprovLine users.'],
];

const frameworks = [
  { name: 'SOC2', status: 'In Progress', detail: 'Controls mapped for audit logging, access control, encryption, and operational readiness.' },
  { name: 'ISO27001', status: 'In Progress', detail: 'Security management practices are being organized into reusable trust artifacts.' },
  { name: 'GDPR', status: 'Ready', detail: 'Tenant isolation, data retention, deletion workflows, and privacy review answers are documented.' },
  { name: 'CCPA', status: 'Ready', detail: 'Customer data handling, retention, and deletion posture are documented for vendor review.' },
  { name: 'HIPAA', status: 'Future', detail: 'Future readiness track. ApprovLine should not be positioned as HIPAA-ready until a formal review is completed.' },
];

const retentionPolicies = [
  ['Approvals', 'Customer-defined retention', 'Primary approval evidence and classification record.'],
  ['Audit Logs', 'Compliance retention policy', 'Immutable history for security and compliance review.'],
  ['Investigations', 'Customer-defined retention', 'Case notes, evidence timelines, risk analysis, and reports.'],
  ['Playbooks', 'Customer-defined retention', 'Uploaded policies, extracted rules, and summaries.'],
  ['Copilot', 'Customer-defined retention', 'Questions, responses, citations, and sources.'],
  ['Memory Graph', 'Customer-defined retention', 'Entity, relationship, and timeline context.'],
];

const accessRows = [
  ['Org Admin', 'Full workspace administration', 'Can manage users, integrations, onboarding, and settings.'],
  ['Compliance', 'Review and investigations', 'Can investigate approvals, export evidence, and use Copilot.'],
  ['Legal', 'Legal evidence review', 'Can review contracts, policies, investigations, and audit evidence.'],
  ['Finance', 'Financial approval review', 'Can review finance approvals, ROI analytics, and risk summaries.'],
  ['Procurement', 'Vendor and purchase review', 'Can review vendor approvals, procurement policies, and investigations.'],
  ['Engineering', 'Technical decision review', 'Can review engineering approvals and relevant source evidence.'],
  ['Viewer', 'Read-only visibility', 'Can view permitted records without administrative actions.'],
  ['Founder Access', 'Platform operations only', 'Founder access is allowlisted and separate from customer workspace roles.'],
  ['Support Access', 'Limited support visibility', 'Support should be scoped, audited, and used only for active customer support.'],
  ['SSO Controls', 'Enterprise identity policies', 'Customers can prepare SSO-only, domain restriction, and group mapping controls.'],
];

const aiGovernance = [
  ['AI Copilot', 'Answers questions from customer-scoped approvals, investigations, playbooks, analytics, and Memory Graph records.'],
  ['Playbook AI', 'Extracts policy rules and compares approvals against required approvers, thresholds, evidence, and risk conditions.'],
  ['Data Boundaries', 'AI context is constrained to the signed-in organization and does not intentionally mix tenant data.'],
  ['AI Limitations', 'AI provides decision intelligence and evidence summaries, but humans remain responsible for business approvals.'],
  ['Human Approval Required', 'ApprovLine detects, explains, and audits approvals; it does not approve or reject requests on behalf of customers.'],
];

const securityDocuments = [
  ['Security Whitepaper', 'Security model, integration posture, and data protection controls.'],
  ['Architecture Overview', 'Tenant isolation, data flow, and connector architecture.'],
  ['Trust Center Overview', 'Executive-ready summary of security and compliance posture.'],
  ['Privacy Policy', 'Customer data handling and privacy commitments.'],
  ['Terms of Service', 'Commercial and product use terms.'],
  ['Data Processing Addendum', 'Processor terms, data handling, and retention commitments.'],
];

const founderMetrics = [
  ['Most requested questions', 'SSO, AI data usage, data retention, integration permissions'],
  ['Pending security reviews', 'Tracked through security request submissions and founder audit logs'],
  ['Pending vendor assessments', 'Centralized here for procurement and compliance follow-up'],
  ['Enterprise readiness', 'SOC2 and ISO27001 in progress; GDPR and CCPA documentation ready'],
];

const connectorReadinessKeys = ['slackClientId', 'googleClientId', 'microsoftClientId', 'jiraClientId', 'serviceNowClientId', 'zoomClientId'] as const;

function toneForLabel(label: string): Tone {
  if (['Ready', 'Healthy', 'Active', 'Configured', 'Completed'].includes(label)) return 'ok';
  if (['In Progress', 'Future', 'Missing', 'Needs Review'].includes(label)) return 'warning';
  if (['Blocked', 'Error', 'Failed'].includes(label)) return 'error';
  return 'neutral';
}

function toneForReadiness(status: ReadinessStatus): Tone {
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

function StatusPill({ label, tone = toneForLabel(label) }: { label: string; tone?: Tone }) {
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

async function submitSecurityRequest(formData: FormData) {
  'use server';

  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization || !tenant.user) redirect('/onboarding');

  const requestType = String(formData.get('requestType') ?? 'Security questionnaire');
  const requester = String(formData.get('requester') ?? '').trim();
  const details = String(formData.get('details') ?? '').trim();

  await writeAuditLog({
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    action: 'security_request_submitted',
    metadata: {
      requestType,
      requester,
      details: details.slice(0, 1200),
      status: 'open',
      source: 'trust_compliance_hub',
    },
  });

  revalidatePath('/trust/compliance');
}

export default async function ComplianceHubPage() {
  const tenant = await getDashboardTenant(1500);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization || !tenant.user) redirect('/onboarding');

  const readiness = await buildReadinessReport();
  const checks = readiness.checks;
  const copilotReady = checks.anthropic?.status === 'ok' || checks.openai?.status === 'ok';
  const identityReady = checks.clerkSecretKey?.status === 'ok' && checks.clerkPublishableKey?.status === 'ok';
  const integrationReady = connectorReadinessKeys.some((key) => checks[key]?.status === 'ok');

  const dashboardCards = [
    { label: 'Security Status', value: 'Active', message: 'Read-only access model, audit logging, and tenant boundaries are documented.' },
    { label: 'Compliance Status', value: 'In Progress', message: 'SOC2 and ISO27001 readiness are tracked while GDPR/CCPA documentation is available.' },
    { label: 'Data Protection Status', value: checks.encryptionKey?.status === 'ok' ? 'Configured' : 'Needs Review', message: checks.encryptionKey?.message ?? 'Encryption key readiness is checked at runtime.' },
    { label: 'Identity Status', value: identityReady ? 'Configured' : 'Needs Review', message: identityReady ? 'Clerk identity keys are configured.' : 'Identity configuration needs attention.' },
    { label: 'Audit Status', value: checks.postgresql?.status === 'ok' ? 'Active' : 'Needs Review', message: checks.postgresql?.message ?? 'Database readiness is required for audit trails.' },
    { label: 'System Health', value: readiness.ready ? 'Healthy' : 'Needs Review', message: readiness.ready ? 'Core readiness checks are passing.' : 'Some readiness checks need follow-up before enterprise review.' },
  ];

  return (
    <DashboardShell>
      <section className="grid gap-8">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-8 bg-[#07111f] px-6 py-8 text-white lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-200">Compliance Hub</p>
              <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">Security questionnaire center for enterprise reviews.</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
                Centralize approved vendor assessment answers, compliance posture, data retention, AI governance, access controls, and security request intake.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <StatusPill label="Vendor review ready" />
                <StatusPill label="AI governance documented" />
                <StatusPill label="Read-only integrations" />
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
              <p className="text-sm font-black text-white">Workspace under review</p>
              <p className="mt-2 text-2xl font-black">{tenant.organization.name}</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">Use this hub during legal, procurement, compliance, and security review to reduce repeated founder responses.</p>
              <PendingLink href="/trust" pendingText="Opening trust center..." className="mt-5 inline-flex rounded-xl border border-white/15 px-4 py-2 text-sm font-black text-white hover:bg-white/10">
                Open Trust Center
              </PendingLink>
            </div>
          </div>
        </div>

        <section className="grid gap-5">
          <SectionHeader
            eyebrow="Dashboard"
            title="Compliance readiness overview"
            description="A fast boardroom view of security, compliance, data protection, identity, audit, and operational health."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {dashboardCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-black uppercase tracking-wide text-slate-500">{card.label}</p>
                  <StatusPill label={card.value} />
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{card.message}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5">
          <SectionHeader
            eyebrow="Questionnaires"
            title="Approved security questionnaire library"
            description="Reusable answers for the questions buyers ask most often during security, procurement, legal, and vendor assessment reviews."
          />
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Question</th>
                    <th className="px-4 py-3">Approved Answer</th>
                    <th className="px-4 py-3">Last Reviewed</th>
                    <th className="px-4 py-3">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {questionnaireLibrary.map((item) => (
                    <tr key={`${item.category}-${item.question}`} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-4"><StatusPill label={item.category} tone="neutral" /></td>
                      <td className="px-4 py-4 font-black text-slate-950">{item.question}</td>
                      <td className="max-w-xl px-4 py-4 leading-6 text-slate-600">{item.answer}</td>
                      <td className="px-4 py-4 font-semibold text-slate-600">{reviewedAt}</td>
                      <td className="px-4 py-4 font-black text-slate-700">{item.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              eyebrow="FAQ"
              title="Enterprise security FAQ"
              description="Clear answers for IT, security, compliance, procurement, and legal reviewers."
            />
            <div className="mt-5 grid gap-3">
              {securityFaq.map(([question, answer]) => (
                <details key={question} className="group rounded-xl border border-slate-200 bg-white p-4">
                  <summary className="cursor-pointer text-sm font-black text-slate-950 marker:text-[#2155d9]">{question}</summary>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{answer}</p>
                </details>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              eyebrow="Frameworks"
              title="Compliance framework tracking"
              description="Track the readiness status customers expect during enterprise procurement."
            />
            <div className="mt-5 grid gap-3">
              {frameworks.map((framework) => (
                <div key={framework.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-black text-slate-950">{framework.name}</p>
                    <StatusPill label={framework.status} />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{framework.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5">
          <SectionHeader
            eyebrow="Retention"
            title="Data retention center"
            description="Document retention expectations for customer review across approvals, audits, investigations, playbooks, Copilot, and Memory Graph data."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {retentionPolicies.map(([name, policy, detail]) => (
              <div key={name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-lg font-black text-slate-950">{name}</p>
                <p className="mt-2 text-sm font-black text-[#2155d9]">{policy}</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5">
          <SectionHeader
            eyebrow="Access control"
            title="Access control review"
            description="Explain workspace access, founder access, support access, role boundaries, and SSO controls in one table."
          />
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Area</th>
                    <th className="px-4 py-3">Scope</th>
                    <th className="px-4 py-3">Control</th>
                  </tr>
                </thead>
                <tbody>
                  {accessRows.map(([area, scope, control]) => (
                    <tr key={area} className="border-t border-slate-100">
                      <td className="px-4 py-4 font-black text-slate-950">{area}</td>
                      <td className="px-4 py-4 font-semibold text-slate-600">{scope}</td>
                      <td className="px-4 py-4 leading-6 text-slate-600">{control}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              eyebrow="AI governance"
              title="AI usage boundaries"
              description="Explain how Copilot and Playbook AI use customer evidence while keeping humans responsible for approvals."
            />
            <div className="mt-5 grid gap-3">
              {aiGovernance.map(([title, detail]) => (
                <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-black text-slate-950">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div id="documents" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              eyebrow="Documents"
              title="Security documents"
              description="Keep common review artifacts in one place for enterprise buyers."
            />
            <div className="mt-5 grid gap-3">
              {securityDocuments.map(([title, detail]) => (
                <div key={title} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-sm font-black text-slate-950">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p>
                  </div>
                  <button type="button" className="inline-flex h-10 min-h-0 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 text-xs font-black text-slate-700">
                    Export PDF
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              eyebrow="Founder view"
              title="Security review operations"
              description="A founder-ready snapshot of the security requests and compliance questions most likely to block enterprise deals."
            />
            <div className="mt-5 grid gap-3">
              {founderMetrics.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-800">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <form action={submitSecurityRequest} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              eyebrow="Requests"
              title="Customer security requests"
              description="Submit security questionnaires, vendor assessment requests, and compliance review requests without leaving the product."
            />
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Request type
                <select name="requestType" className="min-h-0 h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100">
                  <option>Security questionnaire</option>
                  <option>Vendor assessment</option>
                  <option>Compliance request</option>
                  <option>Procurement review</option>
                  <option>Architecture review</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Requester email
                <input name="requester" type="email" placeholder="security@customer.com" className="min-h-0 h-12 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-800 outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
              </label>
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Request details
                <textarea name="details" rows={5} placeholder="Paste the questionnaire, vendor assessment request, or compliance question here." className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold leading-6 text-slate-800 outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
              </label>
              <FormSubmitButton pendingText="Submitting..." className="inline-flex min-h-0 h-12 items-center justify-center gap-2 rounded-xl bg-[#2155d9] px-5 text-sm font-black text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
                Submit security request
              </FormSubmitButton>
            </div>
          </form>
        </section>

        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm md:grid-cols-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-blue-200">Service status</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">Database, queue, identity, Copilot, gateway, and readiness checks are surfaced for enterprise review.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <p className="text-sm font-black">AI providers</p>
            <p className="mt-2 text-sm text-slate-300">{copilotReady ? 'Configured for Copilot and Playbook AI.' : 'Add OpenAI or Anthropic credentials for Copilot readiness.'}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <p className="text-sm font-black">Integration posture</p>
            <p className="mt-2 text-sm text-slate-300">{integrationReady ? 'At least one enterprise connector is configured.' : 'Connectors are documented and ready for credential configuration.'}</p>
          </div>
        </section>
      </section>
    </DashboardShell>
  );
}
