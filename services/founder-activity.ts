/**
 * Customer Activity (/founder/activity) — a customer-centric operational
 * timeline built entirely on the existing FounderAuditLog table. Introduces
 * no new event/audit model.
 *
 * ARCHITECTURE AUDIT — what "activity" actually means in this codebase:
 *
 *   - FounderAuditLog (id/customerAccountId?/actorEmail?/actorRole?/action/
 *     targetType/targetId?/metadata?/createdAt) is the only per-discrete-
 *     event, timestamped, actor-attributed, customerAccountId-scoped
 *     record of what happened to a customer. It already carries the exact
 *     indexes this needs (`[customerAccountId, createdAt]`, `[createdAt]`)
 *     — no new index, no new table.
 *   - /founder/audit (listFounderAuditLogs in services/founder.ts) already
 *     reads this same table, but as a flat, ungrouped, customer-name-blind
 *     governance list with no pagination/count/category/KPIs. This module
 *     is a second, purpose-built READ MODEL over the same table — not a
 *     second event store, and not a modification of that locked page or
 *     its reader function.
 *   - Every action string in lib/founder-activity.ts's taxonomy map is one
 *     actually written today with a real customerAccountId (verified by
 *     direct grep against services/founder.ts and app/founder/*\/
 *     actions.ts). `integration.provider.status_changed` is deliberately
 *     excluded from the taxonomy because it is catalog-wide (no
 *     customerAccountId) and can never appear in this feed's own query.
 *   - Two things the reference mockup implied are deliberately NOT
 *     modeled, because the real data cannot honestly support them: (1) a
 *     customer's own self-service action (every integration/access action
 *     found is written only by a Founder-authorized code path — there is
 *     no code path where a customer's own action reaches this table), and
 *     (2) "onboarding stage changed" as a discrete event (the onboarding
 *     stage is a *computed* value with no persisted transition timestamp
 *     or actor — see services/founder-onboarding.ts). A third mockup
 *     element, an "Integration errors" attention card, is also excluded:
 *     no FounderAuditLog action represents an integration failure — that
 *     signal belongs to Integration Health's CustomerIntegrationStatus
 *     connection state, a distinct concept this module does not recreate.
 *   - KPIs use a fixed, clearly-labeled 30-day window regardless of the
 *     table's own active time-range filter, matching Support & Notes' and
 *     Revenue's convention that headline numbers reflect the whole
 *     portfolio, not whatever the table happens to be filtered to.
 *   - The drawer's "Recent Activity" tab deliberately reuses only the
 *     already-loaded page of rows (filtered client-side to the selected
 *     customer) rather than a second per-customer query — Prisma has no
 *     safe "top N per customer" query without raw SQL window functions,
 *     and a real "View all activity for this customer" link into the same
 *     table's own customer filter already gives a correct way to see the
 *     rest, without a second query shape to maintain.
 */
import { prisma } from '@/lib/prisma';
import type { CustomerAccountStatus, CustomerPlanTier, Prisma } from '@prisma/client';
import type { HealthStatus } from '@/lib/customer-health';
import type { ActivityCategory, ActivityTimeRange } from '@/lib/founder-activity';
import { actionsInCategory, activityTimeRangeCutoff } from '@/lib/founder-activity';

type SafeResult<T> = { data: T; migrationRequired: boolean; safeError?: string };

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').slice(0, 320);
  return String(error).slice(0, 320);
}

function missingFounderStorage(error: unknown): boolean {
  const message = safeErrorMessage(error);
  return message.includes('does not exist') || message.includes('FounderAuditLog') || message.includes('CustomerAccount');
}

export type ActivityRow = {
  id: string;
  createdAt: Date;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  customer: {
    id: string;
    companyName: string;
    domain: string;
    status: CustomerAccountStatus;
    planTier: CustomerPlanTier;
    healthStatus: HealthStatus | null;
    purchasedSeats: number | null;
  };
};

export type ActivityKpis = {
  /** Fixed 30-day window, independent of the table's own time-range filter. */
  eventsLast30: number;
  eventsPrev30: number;
  /** null when there is no real previous-window baseline to compare against (avoids a divide-by-zero/∞% delta). */
  eventsDeltaPct: number | null;
  activeCustomersLast30: number;
  activeCustomersPrev30: number;
  activeCustomersDeltaPct: number | null;
  totalCustomers: number;
  customersWithoutRecentActivity: number;
};

export type ActivityLatest = {
  createdAt: Date;
  action: string;
  metadata: unknown;
  customerId: string;
  customerName: string;
} | null;

export type ActivityPortfolio = {
  rows: ActivityRow[];
  kpis: ActivityKpis;
  latest: ActivityLatest;
  page: number;
  totalPages: number;
  totalEvents: number;
  hasAnyCustomers: boolean;
};

export type ActivityFilters = {
  q?: string;
  customerAccountId?: string;
  category?: ActivityCategory;
  action?: string;
  status?: CustomerAccountStatus;
  timeRange?: ActivityTimeRange;
  page?: number;
};

const TAKE = 20;

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const EMPTY_PORTFOLIO: ActivityPortfolio = {
  rows: [],
  kpis: {
    eventsLast30: 0,
    eventsPrev30: 0,
    eventsDeltaPct: null,
    activeCustomersLast30: 0,
    activeCustomersPrev30: 0,
    activeCustomersDeltaPct: null,
    totalCustomers: 0,
    customersWithoutRecentActivity: 0,
  },
  latest: null,
  page: 1,
  totalPages: 1,
  totalEvents: 0,
  hasAnyCustomers: false,
};

export async function buildActivityPortfolio(filters: ActivityFilters): Promise<SafeResult<ActivityPortfolio>> {
  const page = Math.max(1, filters.page ?? 1);
  const skip = (page - 1) * TAKE;
  const q = filters.q?.trim() || undefined;

  const where: Prisma.FounderAuditLogWhereInput = { customerAccountId: { not: null } };
  const and: Prisma.FounderAuditLogWhereInput[] = [];
  if (q) {
    and.push({
      OR: [
        { actorEmail: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
        { customerAccount: { companyName: { contains: q, mode: 'insensitive' } } },
        { customerAccount: { domain: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }
  if (filters.customerAccountId) and.push({ customerAccountId: filters.customerAccountId });
  if (filters.category) and.push({ action: { in: actionsInCategory(filters.category) } });
  if (filters.action) and.push({ action: filters.action });
  if (filters.status) and.push({ customerAccount: { status: filters.status } });
  const cutoff = filters.timeRange ? activityTimeRangeCutoff(filters.timeRange) : null;
  if (cutoff) and.push({ createdAt: { gte: cutoff } });
  if (and.length) where.AND = and;

  const now = new Date();
  const cutoff30 = new Date(now);
  cutoff30.setDate(cutoff30.getDate() - 30);
  const cutoff60 = new Date(now);
  cutoff60.setDate(cutoff60.getDate() - 60);
  const scopedBase: Prisma.FounderAuditLogWhereInput = { customerAccountId: { not: null } };

  try {
    const [
      rows,
      filteredTotal,
      eventsLast30,
      eventsPrev30,
      activeCustomersLast30Groups,
      activeCustomersPrev30Groups,
      totalCustomers,
      latestLog,
    ] = await Promise.all([
      prisma.founderAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: TAKE,
        include: {
          customerAccount: {
            include: {
              health: { select: { status: true } },
              seatAllocation: { select: { purchasedSeats: true } },
            },
          },
        },
      }),
      prisma.founderAuditLog.count({ where }),
      // KPIs below are always computed from the fixed, unfiltered 30-day
      // baseline — matching Support & Notes' and Revenue's convention that
      // headline numbers reflect the whole portfolio, never the table's
      // own active filters.
      prisma.founderAuditLog.count({ where: { ...scopedBase, createdAt: { gte: cutoff30 } } }),
      prisma.founderAuditLog.count({ where: { ...scopedBase, createdAt: { gte: cutoff60, lt: cutoff30 } } }),
      prisma.founderAuditLog.groupBy({ by: ['customerAccountId'], where: { ...scopedBase, createdAt: { gte: cutoff30 } } }),
      prisma.founderAuditLog.groupBy({ by: ['customerAccountId'], where: { ...scopedBase, createdAt: { gte: cutoff60, lt: cutoff30 } } }),
      prisma.customerAccount.count(),
      prisma.founderAuditLog.findFirst({
        where: scopedBase,
        orderBy: { createdAt: 'desc' },
        include: { customerAccount: { select: { companyName: true } } },
      }),
    ]);

    const activeCustomersLast30 = activeCustomersLast30Groups.length;
    const activeCustomersPrev30 = activeCustomersPrev30Groups.length;

    const mappedRows: ActivityRow[] = [];
    for (const row of rows) {
      // Defensive only: the schema's onDelete:SetNull means a customer
      // delete atomically nulls customerAccountId on its old log rows in
      // the same statement, so a non-null customerAccountId whose
      // customerAccount join comes back empty should not occur in
      // practice — this just keeps a theoretical race from crashing the
      // page rather than silently fabricating a customer identity.
      if (!row.customerAccount) continue;
      mappedRows.push({
        id: row.id,
        createdAt: row.createdAt,
        action: row.action,
        actorEmail: row.actorEmail,
        actorRole: row.actorRole,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata,
        customer: {
          id: row.customerAccount.id,
          companyName: row.customerAccount.companyName,
          domain: row.customerAccount.domain,
          status: row.customerAccount.status,
          planTier: row.customerAccount.planTier,
          healthStatus: (row.customerAccount.health?.status as HealthStatus | undefined) ?? null,
          purchasedSeats: row.customerAccount.seatAllocation?.purchasedSeats ?? null,
        },
      });
    }

    return {
      migrationRequired: false,
      data: {
        rows: mappedRows,
        kpis: {
          eventsLast30,
          eventsPrev30,
          eventsDeltaPct: pctDelta(eventsLast30, eventsPrev30),
          activeCustomersLast30,
          activeCustomersPrev30,
          activeCustomersDeltaPct: pctDelta(activeCustomersLast30, activeCustomersPrev30),
          totalCustomers,
          customersWithoutRecentActivity: Math.max(0, totalCustomers - activeCustomersLast30),
        },
        latest: latestLog && latestLog.customerAccount
          ? { createdAt: latestLog.createdAt, action: latestLog.action, metadata: latestLog.metadata, customerId: latestLog.customerAccountId!, customerName: latestLog.customerAccount.companyName }
          : null,
        page,
        totalPages: Math.max(1, Math.ceil(filteredTotal / TAKE)),
        totalEvents: filteredTotal,
        hasAnyCustomers: totalCustomers > 0,
      },
    };
  } catch (error) {
    return {
      migrationRequired: missingFounderStorage(error),
      safeError: safeErrorMessage(error),
      data: EMPTY_PORTFOLIO,
    };
  }
}
