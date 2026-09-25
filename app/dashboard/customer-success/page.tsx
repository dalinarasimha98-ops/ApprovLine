import { redirect } from 'next/navigation';
import { getCurrentTenant, getDashboardTenant, isTenantDatabaseError } from '@/lib/auth';
import {
  buildCustomerSuccessDashboard,
  selectCustomerPlan,
  submitCustomerFeedback,
  submitNpsScore,
} from '@/services/customerSuccess';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';

export const dynamic = 'force-dynamic';

const cardClass = 'rounded-2xl border border-al-border bg-al-surface p-5 shadow-sm';
const inputClass =
  'h-11 w-full rounded-xl border border-al-border bg-al-surface px-3 text-sm font-semibold text-al-text shadow-sm outline-none transition placeholder:text-al-text-muted focus:border-al-accent focus:ring-4 focus:ring-blue-100';
const textareaClass =
  'min-h-28 w-full rounded-xl border border-al-border bg-al-surface px-3 py-3 text-sm font-semibold text-al-text shadow-sm outline-none transition placeholder:text-al-text-muted focus:border-al-accent focus:ring-4 focus:ring-blue-100';

function cleanString(value: FormDataEntryValue | null, fallback = '') {
  return String(value ?? fallback).trim();
}

async function getCustomerSuccessTenant() {
  const tenant = await getDashboardTenant(8000);
  if (tenant.organization || tenant.status !== 'error') return tenant;

  try {
    const recovered = await getCurrentTenant();
    if (!recovered.organization.onboardedAt) {
      return {
        ...tenant,
        organization: recovered.organization,
        user: recovered.user,
        status: 'onboarding_incomplete' as const,
        error: null,
      };
    }

    return {
      ...tenant,
      organization: recovered.organization,
      user: recovered.user,
      status: 'ready' as const,
      error: null,
    };
  } catch (error) {
    return {
      ...tenant,
      error: isTenantDatabaseError(error) ? error.message : tenant.error,
    };
  }
}

async function choosePlan(formData: FormData) {
  'use server';
  const tenant = await getCustomerSuccessTenant();
  if (!tenant.organization || !tenant.user) redirect('/dashboard/customer-success?success=error');
  await selectCustomerPlan({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
    plan: cleanString(formData.get('plan'), 'Free Trial'),
  });
  redirect('/dashboard/customer-success?success=plan');
}

async function sendFeedback(formData: FormData) {
  'use server';
  const tenant = await getCustomerSuccessTenant();
  if (!tenant.organization || !tenant.user) redirect('/dashboard/customer-success?success=error');
  const title = cleanString(formData.get('title'));
  const body = cleanString(formData.get('body'));
  if (!title || !body) redirect('/dashboard/customer-success?success=invalid_feedback');
  await submitCustomerFeedback({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
    type: cleanString(formData.get('type'), 'product_feedback'),
    title,
    body,
  });
  redirect('/dashboard/customer-success?success=feedback');
}

async function sendNps(formData: FormData) {
  'use server';
  const tenant = await getCustomerSuccessTenant();
  if (!tenant.organization || !tenant.user) redirect('/dashboard/customer-success?success=error');
  const score = Number(cleanString(formData.get('score'), '0'));
  await submitNpsScore({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
    score,
    comment: cleanString(formData.get('comment')) || null,
  });
  redirect('/dashboard/customer-success?success=nps');
}

function queryNotice(status?: string) {
  const messages: Record<string, { title: string; body: string; tone: 'success' | 'error' }> = {
    plan: { title: 'Plan interest recorded', body: 'Customer success can now follow up on this workspace plan.', tone: 'success' },
    feedback: { title: 'Feedback saved', body: 'The feedback was recorded in the audit trail for pilot follow-up.', tone: 'success' },
    nps: { title: 'NPS submitted', body: 'The score was saved for customer health tracking.', tone: 'success' },
    invalid_feedback: { title: 'Feedback needs detail', body: 'Add a title and a short description before submitting.', tone: 'error' },
    error: { title: 'Action unavailable', body: 'Workspace state could not be loaded. Please retry.', tone: 'error' },
  };
  return status ? messages[status] : null;
}

export default async function CustomerSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const tenant = await getCustomerSuccessTenant();
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) {
    return (
      <section className={cardClass}>
        <p className="text-xs font-black uppercase tracking-wide text-amber-700">Customer success unavailable</p>
        <h2 className="mt-2 text-2xl font-black text-al-text">Workspace could not load</h2>
        <p className="mt-2 text-sm font-semibold text-al-text-secondary">{tenant.error ?? 'Retry after the database is ready.'}</p>
      </section>
    );
  }

  const query = await searchParams;
  const notice = queryNotice(query.success);
  const data = await buildCustomerSuccessDashboard(tenant.organization.id);

  return (
    <section className="grid gap-6">
      <div className="overflow-hidden rounded-3xl border border-al-border bg-al-bg p-6 text-white shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Customer Success & Revenue</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Convert pilots into paying customers</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-al-text-secondary">
              Track subscription readiness, usage, customer health, ROI, feedback, and enterprise controls for {tenant.organization.name}.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <PendingLink href="/analytics" pendingText="Opening ROI..." className="inline-flex h-11 items-center justify-center rounded-xl bg-al-accent px-5 text-sm font-black text-white shadow-sm shadow-blue-950/30">
              Executive ROI
            </PendingLink>
            <PendingLink href="/dashboard/pilot" pendingText="Opening pilot..." className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-al-surface/10 px-5 text-sm font-black text-white">
              Pilot Readiness
            </PendingLink>
          </div>
        </div>
      </div>

      {notice ? (
        <div className={`rounded-2xl border p-4 text-sm font-semibold shadow-sm ${notice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
          <h3 className="font-black">{notice.title}</h3>
          <p className="mt-1">{notice.body}</p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Plan', data.subscription.plan, `${data.subscription.status} · ${data.subscription.seats} seats`],
          ['Approvals captured', data.usage.approvalsCaptured, 'Billable approval volume'],
          ['Health score', `${data.health.score}/100`, data.health.label],
          ['ROI impact', `$${data.roi.financialImpact.toLocaleString()}`, `${data.roi.estimatedHoursSaved} hours saved`],
        ].map(([label, value, help]) => (
          <div key={label} className={cardClass}>
            <p className="text-xs font-black uppercase tracking-wide text-al-text-muted">{label}</p>
            <p className="mt-3 text-3xl font-black text-al-text">{value}</p>
            <p className="mt-2 text-sm font-semibold text-al-text-muted">{help}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className={cardClass}>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-al-accent">Subscription management</p>
              <h3 className="mt-1 text-xl font-black text-al-text">Plan readiness</h3>
            </div>
            <p className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase text-al-accent">
              Renews {data.subscription.currentPeriodEnd.toLocaleDateString()}
            </p>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {data.plans.map((plan) => (
              <form key={plan.name} action={choosePlan} className="rounded-2xl border border-al-border bg-al-surface-sunken p-4">
                <input type="hidden" name="plan" value={plan.name} />
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-black text-al-text">{plan.name}</p>
                  <span className="rounded-full bg-al-surface px-3 py-1 text-xs font-black text-al-text-secondary ring-1 ring-slate-200">{plan.price}</span>
                </div>
                <p className="mt-3 text-sm font-bold text-al-text-secondary">{plan.limits}</p>
                <div className="mt-3 grid gap-2">
                  {plan.features.map((feature) => (
                    <span key={feature} className="text-xs font-semibold text-al-text-muted">✓ {feature}</span>
                  ))}
                </div>
                <FormSubmitButton pendingText="Recording..." className="mt-4 inline-flex h-10 items-center rounded-lg bg-al-accent px-4 text-xs font-black text-white shadow-sm shadow-blue-200">
                  Mark interest
                </FormSubmitButton>
              </form>
            ))}
          </div>
        </div>

        <div className={cardClass}>
          <p className="text-xs font-black uppercase tracking-wide text-al-accent">Workspace billing</p>
          <h3 className="mt-1 text-xl font-black text-al-text">Usage meters</h3>
          <div className="mt-5 grid gap-3">
            {[
              ['Users', data.billing.users],
              ['Integrations', `${data.billing.connectedIntegrations}/${data.billing.integrations}`],
              ['Playbooks', data.billing.playbooks],
              ['Approval volume', data.billing.approvalVolume],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-xl border border-al-border bg-al-surface-sunken px-4 py-3">
                <span className="text-sm font-bold text-al-text-secondary">{label}</span>
                <span className="text-sm font-black text-al-text">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className={cardClass}>
          <p className="text-xs font-black uppercase tracking-wide text-al-accent">Usage dashboard</p>
          <h3 className="mt-1 text-xl font-black text-al-text">Adoption signals</h3>
          <div className="mt-5 grid gap-3">
            {[
              ['Approvals captured', data.usage.approvalsCaptured],
              ['Investigations created', data.usage.investigationsCreated],
              ['Playbook queries', data.usage.playbookQueries],
              ['Exports generated', data.usage.exportsGenerated],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-al-surface-sunken p-3">
                <p className="text-xs font-black uppercase tracking-wide text-al-text-muted">{label}</p>
                <p className="mt-1 text-2xl font-black text-al-text">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={cardClass}>
          <p className="text-xs font-black uppercase tracking-wide text-al-accent">ROI calculator</p>
          <h3 className="mt-1 text-xl font-black text-al-text">Business impact</h3>
          <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm font-bold leading-6 text-blue-950">{data.roi.summary}</p>
          <div className="mt-4 grid gap-2 text-sm font-semibold text-al-text-secondary">
            <span>Audit effort reduced: <b className="text-al-text">{data.roi.auditEffortReduced} hours</b></span>
            <span>Compliance improvement: <b className="text-al-text">{data.roi.complianceImprovement}%</b></span>
            <span>Financial impact: <b className="text-al-text">${data.roi.financialImpact.toLocaleString()}</b></span>
          </div>
        </div>

        <div className={cardClass}>
          <p className="text-xs font-black uppercase tracking-wide text-al-accent">Customer health</p>
          <h3 className="mt-1 text-xl font-black text-al-text">{data.health.label}</h3>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-al-surface-elevated">
            <span className="block h-full rounded-full bg-al-accent" style={{ width: `${data.health.score}%` }} />
          </div>
          <p className="mt-3 text-4xl font-black text-al-text">{data.health.score}</p>
          <div className="mt-4 grid gap-2 text-xs font-semibold text-al-text-muted">
            {Object.entries(data.health.inputs).map(([label, value]) => (
              <span key={label} className="flex justify-between rounded-lg bg-al-surface-sunken px-3 py-2">
                <span>{label.replace(/([A-Z])/g, ' $1')}</span>
                <b className="text-al-text">{value}</b>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className={cardClass}>
          <p className="text-xs font-black uppercase tracking-wide text-amber-600">Admin notifications</p>
          <h3 className="mt-1 text-xl font-black text-al-text">Revenue risks</h3>
          <div className="mt-5 grid gap-3">
            {data.notifications.length ? data.notifications.map((item) => (
              <div key={item.title} className={`rounded-xl border p-3 ${item.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
                <p className="text-sm font-black">{item.title}</p>
                <p className="mt-1 text-sm font-semibold">{item.body}</p>
              </div>
            )) : (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">No active revenue-risk alerts.</p>
            )}
          </div>
        </div>

        <div className={cardClass}>
          <p className="text-xs font-black uppercase tracking-wide text-al-accent">Feedback & NPS</p>
          <h3 className="mt-1 text-xl font-black text-al-text">Collect conversion signals</h3>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <form action={sendFeedback} className="grid gap-3">
              <select name="type" defaultValue="feature_request" className={inputClass}>
                <option value="product_feedback">Product feedback</option>
                <option value="feature_request">Feature request</option>
                <option value="pricing_objection">Pricing objection</option>
                <option value="security_question">Security question</option>
              </select>
              <input name="title" required placeholder="Short title" className={inputClass} />
              <textarea name="body" required placeholder="What did the customer say?" className={textareaClass} />
              <FormSubmitButton pendingText="Saving..." className="inline-flex h-10 items-center justify-center rounded-lg bg-al-accent px-4 text-sm font-black text-white">
                Save feedback
              </FormSubmitButton>
            </form>
            <form action={sendNps} className="grid content-start gap-3">
              <label className="grid gap-1 text-sm font-black text-al-text-secondary">
                NPS score
                <input name="score" type="number" min="0" max="10" defaultValue="9" className={inputClass} />
              </label>
              <textarea name="comment" placeholder="Optional NPS comment" className={textareaClass} />
              <FormSubmitButton pendingText="Saving..." className="inline-flex h-10 items-center justify-center rounded-lg border border-al-border bg-al-surface px-4 text-sm font-black text-al-text-secondary">
                Submit NPS
              </FormSubmitButton>
            </form>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className={cardClass}>
          <p className="text-xs font-black uppercase tracking-wide text-al-accent">Customer case studies</p>
          <h3 className="mt-1 text-xl font-black text-al-text">Exportable pilot ROI story</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-al-text-secondary">
            Generate board-ready ROI reports from captured approvals, integrations, investigations, and Playbook AI usage.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <PendingLink href="/api/export/analytics?format=pdf" pendingText="Preparing PDF..." className="inline-flex h-10 items-center rounded-lg bg-al-accent px-4 text-sm font-black text-white">
              PDF ROI Report
            </PendingLink>
            <PendingLink href="/api/export/analytics?format=csv" pendingText="Preparing CSV..." className="inline-flex h-10 items-center rounded-lg border border-al-border bg-al-surface px-4 text-sm font-black text-al-text-secondary">
              CSV Metrics
            </PendingLink>
          </div>
        </div>

        <div className="rounded-2xl border border-al-border bg-al-bg p-5 text-white shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-blue-200">Enterprise readiness</p>
          <h3 className="mt-1 text-xl font-black">Security center</h3>
          <div className="mt-5 grid gap-3">
            {[
              ['SSO placeholders', data.enterprise.sso],
              ['Security posture', data.enterprise.securityCenter],
              ['Data retention', data.enterprise.retention],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-al-surface/[0.06] p-3">
                <p className="text-xs font-black uppercase tracking-wide text-blue-200">{label}</p>
                <p className="mt-1 text-sm font-semibold text-al-text-secondary">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <p className="text-xs font-black uppercase tracking-wide text-al-accent">Recent customer signals</p>
        <h3 className="mt-1 text-xl font-black text-al-text">Feedback, NPS, and pilot events</h3>
        <div className="mt-5 grid gap-3">
          {data.feedbackEvents.length ? data.feedbackEvents.map((event) => (
            <div key={event.id} className="rounded-xl border border-al-border bg-al-surface-sunken p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black text-al-text">{event.action}</p>
                <p className="text-xs font-bold text-al-text-muted">{event.createdAt.toLocaleString()}</p>
              </div>
              <p className="mt-1 text-xs font-semibold text-al-text-muted">Stored in audit log for customer success follow-up.</p>
            </div>
          )) : (
            <p className="rounded-xl border border-dashed border-al-border p-4 text-sm font-semibold text-al-text-muted">Customer feedback and NPS responses will appear here.</p>
          )}
        </div>
      </div>
    </section>
  );
}
