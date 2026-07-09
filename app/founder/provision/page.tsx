import { redirect } from 'next/navigation';
import { FounderBadge } from '@/components/founder/FounderShell';
import { founderFeatures, founderIntegrationCatalog, getFounderAccess, provisionFounderCustomer } from '@/services/founder';

export const dynamic = 'force-dynamic';

function safeProvisionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgresql:\/\/[^ ]+/g, '[database-url-redacted]').slice(0, 220);
}

async function provisionAction(formData: FormData) {
  'use server';
  const access = await getFounderAccess().catch((error) => {
    console.error('[founder] provision access check failed', error);
    return null;
  });
  if (!access) redirect('/founder/provision?error=access_check_failed');
  if (!access.ok || access.readOnly) redirect('/founder/provision?error=read_only');
  const customer = await provisionFounderCustomer(access, formData).catch((error) => {
    console.error('[founder] customer provisioning failed', error);
    return null;
  });
  if (!customer) redirect('/founder/provision?error=provision_failed');
  redirect(`/founder/customers/${customer.id}?created=1`);
}

function provisionErrorCopy(error?: string) {
  if (error === 'read_only') return 'Support admins cannot provision customer accounts.';
  if (error === 'access_check_failed') return 'Founder access could not be verified. Open readiness, confirm your super admin allowlist, then try again.';
  if (error === 'provision_failed') return 'Customer provisioning could not complete. Open founder readiness and confirm production migrations are applied.';
  return null;
}

export default async function FounderProvisionPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const access = await getFounderAccess().catch((error) => {
    console.error('[founder] provision page access check failed', error);
    return { ok: false as const, reason: 'forbidden' as const, email: null, safeError: safeProvisionError(error) };
  });
  const params = await searchParams;
  const readOnly = !access.ok || access.readOnly;
  const errorCopy = provisionErrorCopy(params?.error);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Provisioning</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Create customer workspace</h2>
            <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
              Create the account shell, plan, seat allocation, feature gates, and integration access. Customer IT connects Slack, Gmail, Teams, Jira, ServiceNow, and other credentials inside their own workspace.
            </p>
          </div>
          {readOnly ? <FounderBadge tone="amber">Read only</FounderBadge> : null}
        </div>
        {'safeError' in access ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
            Founder access could not be checked safely. Safe diagnostic: {access.safeError}
          </div>
        ) : null}
        {errorCopy ? <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{errorCopy}</p> : null}
      </section>

      <form action={provisionAction} className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Account details</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Company name
              <input required name="companyName" placeholder="Acme Inc." className="min-h-12 rounded-xl border border-slate-200 px-4 font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Company domain
              <input required name="domain" placeholder="acme.com" className="min-h-12 rounded-xl border border-slate-200 px-4 font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Primary admin name
              <input name="primaryAdminName" placeholder="Sarah Johnson" className="min-h-12 rounded-xl border border-slate-200 px-4 font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Primary admin email
              <input required type="email" name="primaryAdminEmail" placeholder="sarah@acme.com" className="min-h-12 rounded-xl border border-slate-200 px-4 font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Industry
              <input name="industry" placeholder="Fintech" className="min-h-12 rounded-xl border border-slate-200 px-4 font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Plan
              <select name="planTier" className="min-h-12 rounded-xl border border-slate-200 px-4 font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100">
                <option value="FREE_TRIAL">Free Trial</option>
                <option value="STARTER">Starter</option>
                <option value="GROWTH">Growth</option>
                <option value="ENTERPRISE">Enterprise</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Seats
              <input type="number" name="seats" defaultValue={5} min={1} className="min-h-12 rounded-xl border border-slate-200 px-4 font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Data retention days
              <input type="number" name="dataRetentionDays" defaultValue={365} min={30} className="min-h-12 rounded-xl border border-slate-200 px-4 font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100" />
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Operating boundary</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Founder controls do not manage credentials</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            This page enables access to connectors. Customer admins still perform OAuth and provide credentials from their own workspace.
          </p>
          <button disabled={readOnly} className="mt-6 w-full rounded-xl bg-[#2557dc] px-5 py-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            Provision customer
          </button>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Feature access</p>
          <div className="mt-4 grid gap-3">
            {founderFeatures.map((feature) => (
              <label key={feature.key} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <input type="checkbox" name="features" value={feature.key} defaultChecked className="mt-1 h-4 w-4" />
                <span>
                  <span className="block font-black text-slate-950">{feature.label}</span>
                  <span className="block text-sm font-semibold leading-6 text-slate-600">{feature.description}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Integration access</p>
          <div className="mt-4 grid gap-3">
            {founderIntegrationCatalog.map((integration) => (
              <label key={integration.key} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <input type="checkbox" name="integrations" value={integration.key} defaultChecked className="mt-1 h-4 w-4" />
                <span>
                  <span className="block font-black text-slate-950">{integration.label}</span>
                  <span className="block text-sm font-semibold text-slate-600">{integration.category} · customer-owned connection</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      </form>
    </div>
  );
}
