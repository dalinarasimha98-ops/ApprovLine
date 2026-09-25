import { redirect } from 'next/navigation';
import { FileBarChart2, BarChart3, Download, LayoutList } from 'lucide-react';
import { getDashboardTenant } from '@/lib/auth';
import { enforcePageRole } from '@/lib/rbac';
import { getReportsSummary, getExportHistory, REPORT_CATALOG } from '@/services/reports';
import { ReportsCenter } from '@/components/dashboard/reports/ReportsCenter';

export const dynamic = 'force-dynamic';

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  colorClass,
}: {
  icon: typeof FileBarChart2;
  label: string;
  value: string | number;
  sub?: string;
  colorClass: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-al-border bg-al-surface p-5 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${colorClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-al-text-muted">{label}</p>
        <p className="mt-0.5 text-2xl font-black tabular-nums text-al-text">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-al-text-muted">{sub}</p>}
      </div>
    </div>
  );
}

export default async function ReportsAndExportsPage() {
  const tenant = await getDashboardTenant(3000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');

  enforcePageRole('/dashboard/audit', tenant.user?.role ?? 'VIEWER');

  const [summary, exportHistory] = await Promise.all([
    getReportsSummary(tenant.organization.id),
    getExportHistory(tenant.organization.id),
  ]);

  return (
    <section className="grid gap-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-al-border bg-al-surface p-6 shadow-sm sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-al-accent">Governance &amp; Risk</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-al-text">Reports &amp; Exports</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-al-text-secondary">
            Generate insightful reports and export ApprovLine data for compliance, audits, investigations, and business analysis.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href="/api/export/approvals?format=csv"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-al-border bg-al-surface px-4 text-sm font-bold text-al-text-secondary shadow-sm hover:bg-al-surface-sunken"
          >
            <Download className="h-4 w-4" />
            Quick CSV Export
          </a>
        </div>
      </div>

      {/* KPI summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={LayoutList}
          label="Available Reports"
          value={summary.availableReports}
          sub="Backed by real export APIs"
          colorClass="border-al-info/30 bg-al-info/10 text-blue-600"
        />
        <SummaryCard
          icon={FileBarChart2}
          label="Approval Records"
          value={summary.approvalRecordCount.toLocaleString()}
          sub="Total records available to report on"
          colorClass="border-al-accent/30 bg-al-accent/10 text-al-accent"
        />
        <SummaryCard
          icon={BarChart3}
          label="Exports (30 days)"
          value={summary.recentExportCount}
          sub="From this workspace"
          colorClass="border-al-success/30 bg-al-success/10 text-al-success"
        />
      </div>

      {/* Reports interface */}
      <ReportsCenter
        catalog={REPORT_CATALOG}
        summary={summary}
        exportHistory={exportHistory}
      />
    </section>
  );
}
