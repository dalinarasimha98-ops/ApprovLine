import { FounderBadge, MigrationNotice } from '@/components/founder/FounderShell';
import { getFounderAccess } from '@/services/founder';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type TableCount = { label: string; count: number; ok: boolean };

export default async function FounderSettingsPage() {
  const access = await getFounderAccess();

  // Check founder storage table availability
  const tableChecks: TableCount[] = [];
  let migrationRequired = false;
  let safeError: string | undefined;

  try {
    const [customers, users, notes, health, auditLogs, features, integrations] = await Promise.all([
      prisma.customerAccount.count().catch(() => -1),
      prisma.founderManagedUser.count().catch(() => -1),
      prisma.customerNote.count().catch(() => -1),
      prisma.customerHealth.count().catch(() => -1),
      prisma.founderAuditLog.count().catch(() => -1),
      prisma.customerFeatureFlag.count().catch(() => -1),
      prisma.customerIntegrationStatus.count().catch(() => -1),
    ]);
    tableChecks.push(
      { label: 'CustomerAccount', count: customers, ok: customers >= 0 },
      { label: 'FounderManagedUser', count: users, ok: users >= 0 },
      { label: 'CustomerNote', count: notes, ok: notes >= 0 },
      { label: 'CustomerHealth', count: health, ok: health >= 0 },
      { label: 'FounderAuditLog', count: auditLogs, ok: auditLogs >= 0 },
      { label: 'CustomerFeatureFlag', count: features, ok: features >= 0 },
      { label: 'CustomerIntegrationStatus', count: integrations, ok: integrations >= 0 },
    );
    migrationRequired = tableChecks.some((t) => !t.ok);
  } catch (error) {
    migrationRequired = true;
    safeError = (error instanceof Error ? error.message : String(error)).slice(0, 220);
  }

  const envChecks = [
    { label: 'FOUNDER_USER_ID', set: Boolean(process.env.FOUNDER_USER_ID), sensitive: true },
    { label: 'FOUNDER_EMAIL', set: Boolean(process.env.FOUNDER_EMAIL), sensitive: true },
    { label: 'DATABASE_URL', set: Boolean(process.env.DATABASE_URL), sensitive: true },
    { label: 'CLERK_SECRET_KEY', set: Boolean(process.env.CLERK_SECRET_KEY), sensitive: true },
    { label: 'ENCRYPTION_KEY', set: Boolean(process.env.ENCRYPTION_KEY), sensitive: true },
    { label: 'ANTHROPIC_API_KEY', set: Boolean(process.env.ANTHROPIC_API_KEY), sensitive: true },
    { label: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', set: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY), sensitive: false },
    { label: 'APP_URL', set: Boolean(process.env.APP_URL), sensitive: false },
    { label: 'REDIS_URL', set: Boolean(process.env.REDIS_URL), sensitive: true },
  ];

  const allEnvSet = envChecks.every((c) => c.set);

  return (
    <div className="space-y-6">
      {migrationRequired ? <MigrationNotice message={safeError} /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Founder Settings</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Console configuration</h2>
        <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-600">
          Environment, storage, and access diagnostics. All values are read-only — configure via environment variables only.
        </p>
      </section>

      {/* Session */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Active session</p>
        <h3 className="mt-2 text-xl font-black text-slate-950">Founder identity</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {access.ok ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Role</p>
                <p className="mt-2 font-black text-slate-950">{access.role.replace(/_/g, ' ')}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Email</p>
                <p className="mt-2 font-black text-slate-950">{access.email}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Write access</p>
                <FounderBadge tone={access.readOnly ? 'amber' : 'green'}>{access.readOnly ? 'Read only' : 'Full access'}</FounderBadge>
              </div>
            </>
          ) : (
            <div className="col-span-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="font-black text-rose-800">Access check failed: {access.reason}</p>
            </div>
          )}
        </div>
      </section>

      {/* Environment checks */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Environment</p>
            <h3 className="mt-2 text-xl font-black text-slate-950">Required variables</h3>
          </div>
          <FounderBadge tone={allEnvSet ? 'green' : 'red'}>{allEnvSet ? 'All set' : 'Missing vars'}</FounderBadge>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {envChecks.map((check) => (
            <div key={check.label} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <span className="font-mono text-xs font-bold text-slate-700">{check.label}</span>
              <FounderBadge tone={check.set ? 'green' : 'red'}>{check.set ? 'Set' : 'Missing'}</FounderBadge>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-800">
          Values are never exposed here. Only presence (set/missing) is shown. Configure via your hosting platform or .env.local.
        </p>
      </section>

      {/* Storage checks */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Storage</p>
            <h3 className="mt-2 text-xl font-black text-slate-950">Founder tables</h3>
          </div>
          <FounderBadge tone={migrationRequired ? 'amber' : 'green'}>
            {migrationRequired ? 'Migration needed' : 'All tables present'}
          </FounderBadge>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {tableChecks.map((check) => (
            <div key={check.label} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <span className="font-mono text-xs font-bold text-slate-700">{check.label}</span>
              <div className="flex items-center gap-2">
                {check.ok ? <span className="text-xs font-bold text-slate-500">{check.count} rows</span> : null}
                <FounderBadge tone={check.ok ? 'green' : 'red'}>{check.ok ? 'OK' : 'Missing'}</FounderBadge>
              </div>
            </div>
          ))}
        </div>
        {migrationRequired ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
            Run <code className="rounded bg-white px-2 py-0.5">npm run db:deploy</code> to apply the founder storage migration.
          </div>
        ) : null}
      </section>

      {/* Links */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Quick links</p>
        <h3 className="mt-2 text-xl font-black text-slate-950">Related tools</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            { href: '/founder/readiness', label: 'Deployment readiness' },
            { href: '/founder/certification', label: 'Production certification' },
            { href: '/founder/reliability', label: 'Reliability report' },
            { href: '/health', label: 'System health check', external: true },
            { href: '/founder/observability', label: 'Observability center' },
            { href: '/founder/security/isolation', label: 'Tenant isolation report' },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 hover:bg-white hover:border-[#2557dc] hover:text-[#2557dc] transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
