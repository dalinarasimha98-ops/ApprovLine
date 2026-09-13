import { MigrationNotice } from '@/components/founder/FounderShell';
import { ActivityPortfolioClient } from '@/components/founder/ActivityPortfolioClient';
import { getFounderAccess } from '@/services/founder';
import { buildActivityPortfolio } from '@/services/founder-activity';
import { activityLabelFor, activityContextSuffix, fmtRelativeTime, ACTIVITY_CATEGORY_FILTER_OPTIONS, ACTIVITY_ACTION_FILTER_OPTIONS, ACTIVITY_TIME_RANGE_OPTIONS } from '@/lib/founder-activity';
import type { CustomerAccountStatus } from '@prisma/client';
import type { ActivityCategory, ActivityTimeRange } from '@/lib/founder-activity';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CHURNED']);
const VALID_CATEGORIES = new Set<string>(ACTIVITY_CATEGORY_FILTER_OPTIONS.map((o) => o.value).filter(Boolean));
const VALID_ACTIONS = new Set<string>(ACTIVITY_ACTION_FILTER_OPTIONS.map((o) => o.value));
const VALID_TIME_RANGES = new Set<string>(ACTIVITY_TIME_RANGE_OPTIONS.map((o) => o.value));

function fmtTrend(pct: number | null): { text: string; tone: 'up' | 'down' | 'flat' } | null {
  if (pct === null) return null;
  if (pct === 0) return { text: '0% vs previous 30 days', tone: 'flat' };
  return { text: `${Math.abs(pct)}% vs previous 30 days`, tone: pct > 0 ? 'up' : 'down' };
}

function TrendMetricCard({ label, value, detail, trend }: { label: string; value: string | number; detail: string; trend: { text: string; tone: 'up' | 'down' | 'flat' } | null }) {
  const trendColor = trend?.tone === 'up' ? 'text-emerald-600' : trend?.tone === 'down' ? 'text-rose-600' : 'text-slate-500';
  const arrow = trend?.tone === 'up' ? '↑' : trend?.tone === 'down' ? '↓' : '';
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{detail}</p>
      {trend ? <p className={`mt-1 text-xs font-bold ${trendColor}`}>{arrow} {trend.text}</p> : null}
    </article>
  );
}

export default async function FounderActivityPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; customerAccountId?: string; category?: string; action?: string; status?: string; timeRange?: string; page?: string }>;
}) {
  await getFounderAccess();

  const sp = await searchParams;
  const q = sp?.q ?? '';
  // Every filter value from the query string is validated against its
  // real allowed set before use — a malformed/tampered URL must be
  // ignored rather than reaching Prisma as a raw string (the same
  // hardening applied across every Founder portfolio module).
  const customerAccountId = sp?.customerAccountId ?? '';
  const category = (VALID_CATEGORIES.has(sp?.category ?? '') ? sp!.category : '') as ActivityCategory | '';
  const action = (VALID_ACTIONS.has(sp?.action ?? '') ? sp!.action : '') as string;
  const status = (VALID_STATUSES.has(sp?.status ?? '') ? sp!.status : '') as CustomerAccountStatus | '';
  const timeRange = (VALID_TIME_RANGES.has(sp?.timeRange ?? '') ? sp!.timeRange : '30') as ActivityTimeRange;
  const page = Math.max(1, Number(sp?.page ?? '1') || 1);

  const result = await buildActivityPortfolio({
    q: q || undefined,
    customerAccountId: customerAccountId || undefined,
    category: category || undefined,
    action: action || undefined,
    status: status || undefined,
    timeRange,
    page,
  });
  const data = result.data;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Customer Success</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Customer Activity</h2>
        <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-600">
          Track meaningful customer lifecycle, administration, commercial, integration, product, and support events across the ApprovLine customer portfolio.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <TrendMetricCard label="Activity Events" value={data.kpis.eventsLast30} detail="Last 30 days" trend={fmtTrend(data.kpis.eventsDeltaPct)} />
        <TrendMetricCard
          label="Active Customers"
          value={`${data.kpis.activeCustomersLast30} / ${data.kpis.totalCustomers}`}
          detail="With recent activity"
          trend={fmtTrend(data.kpis.activeCustomersDeltaPct)}
        />
        <TrendMetricCard label="Customers Without Recent Activity" value={data.kpis.customersWithoutRecentActivity} detail="No activity in last 30 days" trend={null} />
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Latest Activity</p>
          {data.latest ? (
            <>
              <p className="mt-3 text-2xl font-black tracking-tight text-slate-950">{fmtRelativeTime(data.latest.createdAt)}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                {data.latest.customerName} · {activityLabelFor(data.latest.action, data.latest.metadata)}{activityContextSuffix(data.latest.action, data.latest.metadata, null)}
              </p>
            </>
          ) : (
            <p className="mt-3 text-base font-black text-slate-400">No activity recorded</p>
          )}
        </article>
      </section>

      <ActivityPortfolioClient
        rows={data.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))}
        page={data.page}
        totalPages={data.totalPages}
        totalEvents={data.totalEvents}
        hasAnyCustomers={data.hasAnyCustomers}
        filters={{ q, customerAccountId, category, action, status, timeRange }}
      />

    </div>
  );
}
