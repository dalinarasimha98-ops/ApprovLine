/**
 * Seats & Usage (/founder/seats) — portfolio-wide seat capacity/allocation/
 * utilization control surface. Built entirely on the existing
 * CustomerAccount / CustomerSeatAllocation / FounderManagedUser /
 * CustomerHealth records; introduces no new seat, usage, or billing model.
 *
 * Data-integrity trace (do not assume CustomerHealth.activeUsers is the
 * same thing as CustomerSeatAllocation.usedSeats without checking):
 *
 *   - CustomerSeatAllocation.usedSeats is written in exactly three places
 *     in services/founder.ts — recalculateCustomerSeats(),
 *     updateCustomerSeats(), and updateCustomerAccountDetails() — and all
 *     three set it to a *freshly computed*
 *     `prisma.founderManagedUser.count({ where: { customerAccountId,
 *     status: 'ACTIVE' } })` at write time, never a stale passed-through
 *     value. recalculateCustomerSeats() itself runs after every single
 *     FounderManagedUser status mutation (invite/activate/suspend/remove/
 *     revoke/resend/role-change — see inviteFounderCustomerUser and
 *     updateFounderCustomerUser). So usedSeats is authoritative for every
 *     write path that exists today, but it is a write-through cache, not a
 *     live aggregate — it would only go stale if some future code path
 *     changed FounderManagedUser.status without also calling one of those
 *     three functions. No such path exists in this codebase.
 *   - CustomerHealth.activeUsers is a *separate* materialized column,
 *     refreshed by refreshCustomerHealth() using the identical count query.
 *     Every current call site invokes recalculateCustomerSeats() and
 *     refreshCustomerHealth() back-to-back, so the two numbers are
 *     numerically identical today by construction — but they are two
 *     independently-upserted copies of the same fact, not one shared
 *     source. This module never uses CustomerHealth.activeUsers for a seat
 *     count and never labels it "seats" anywhere.
 *   - allocatedSeats is set identically to purchasedSeats by every current
 *     write path (updateCustomerSeats, updateCustomerAccountDetails, and
 *     recalculateCustomerSeats's create-branch all set both to the same
 *     value). The two columns are displayed separately per the schema and
 *     target IA, but will show as equal until some future workflow (e.g.
 *     team-level seat pooling) actually diverges them.
 *
 * Utilization is deliberately never clamped to 100% here — see
 * lib/founder-seats.ts's computeUtilizationPercent for why this
 * intentionally differs from Plans & Billing's own (clamped,
 * progress-bar-safe) seatUtilizationPercent helper.
 *
 * Visual-polish pass additions (all additive, same one query batch, no new
 * engine): `capacityOverview` and `topPressure` are computed from the same
 * unfiltered `allSeatAllocations` scan the KPI buckets already used — never
 * netted across customers, so one customer's spare capacity can never mask
 * another's over-capacity in the portfolio-wide totals. `recentSeatChanges`
 * reads the exact same FounderAuditLog rows updateCustomerSeats() already
 * writes via logFounderAction() (action `customer.seats.updated`) — no
 * second audit trail, and it only ever shows the fields that action
 * actually records (new purchasedSeats + activeUsers at time of change);
 * it never fabricates a "previous value" the audit metadata doesn't store.
 */
import { prisma } from '@/lib/prisma';
import type { CustomerAccountStatus, CustomerPlanTier, Prisma } from '@prisma/client';
import type { PlanBucket, UtilizationBucket } from '@/lib/founder-seats';
import { computeAvailableSeats, computeUtilizationPercent, utilizationBucketFor } from '@/lib/founder-seats';

type SafeResult<T> = { data: T; migrationRequired: boolean; safeError?: string };

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').slice(0, 320);
  return String(error).slice(0, 320);
}

function missingFounderStorage(error: unknown): boolean {
  const message = safeErrorMessage(error);
  return message.includes('does not exist') || message.includes('CustomerAccount') || message.includes('CustomerSeatAllocation');
}

export type SeatsRow = {
  id: string;
  companyName: string;
  domain: string;
  primaryAdminEmail: string;
  planTier: CustomerPlanTier;
  status: CustomerAccountStatus;
  purchasedSeats: number;
  allocatedSeats: number;
  usedSeats: number;
  availableSeats: number;
  utilizationPercent: number | null;
  utilizationBucket: UtilizationBucket | null;
  updatedAt: Date;
  createdAt: Date;
  invitedUsers: number;
  suspendedUsers: number;
  totalUsers: number;
  approvalsProcessed: number | null;
  integrationsConnected: number | null;
  lastLoginAt: Date | null;
};

export type SeatsKpis = {
  purchasedSeatsTotal: number;
  allocatedSeatsTotal: number;
  usedSeatsTotal: number;
  // purchasedSeatsTotal - usedSeatsTotal, portfolio-wide. Can be negative:
  // that is a real, honest signal (the portfolio as a whole is over
  // capacity), never floored at 0 — same discipline as the per-row
  // computeAvailableSeats.
  availableSeatsTotal: number;
  overallUtilizationPercent: number | null;
  // Real-count buckets, mutually exclusive: every allocation with
  // purchasedSeats > 0 falls into exactly one of healthy/nearCapacity/
  // overCapacity, or noUsage additionally when usedSeats is 0 (noUsage can
  // overlap with "healthy" bucket-wise, since 0 used is UNDER_50 — it is
  // reported as its own, separately meaningful signal, not folded away).
  healthyCount: number;
  nearCapacityCount: number;
  overCapacityCount: number;
  noUsageCount: number;
};

// Honest capacity-overview totals for a stacked-bar visualization. Computed
// per-customer, never netted across customers — a customer 20 seats under
// and another 20 over never cancel out into a falsely "balanced" total.
export type CapacityOverviewTotals = {
  usedWithinPurchasedTotal: number; // sum of min(used_i, purchased_i)
  availableTotal: number; // sum of max(purchased_i - used_i, 0)
  overCapacityTotal: number; // sum of max(used_i - purchased_i, 0)
};

export type TopPressureRow = {
  id: string;
  companyName: string;
  domain: string;
  purchasedSeats: number;
  usedSeats: number;
  utilizationPercent: number | null;
  utilizationBucket: UtilizationBucket | null;
};

export type SeatChangeAuditRow = {
  id: string;
  createdAt: Date;
  actorEmail: string | null;
  companyName: string | null;
  customerAccountId: string | null;
  purchasedSeats: number | null;
  activeUsers: number | null;
};

export type SeatsPortfolio = {
  rows: SeatsRow[];
  kpis: SeatsKpis;
  capacityOverview: CapacityOverviewTotals;
  // Top 5 real allocations by utilization percent, portfolio-wide
  // (independent of the table's active filters/pagination, same convention
  // as the KPI strip) — excludes allocations with purchasedSeats <= 0
  // (utilizationPercent is null/undefined for those, not a real ranking).
  topPressure: TopPressureRow[];
  recentSeatChanges: SeatChangeAuditRow[];
  page: number;
  totalPages: number;
  totalCustomers: number;
  hasAnyCustomers: boolean;
};

export type SeatsFilters = {
  q?: string;
  plan?: PlanBucket;
  status?: CustomerAccountStatus;
  utilization?: UtilizationBucket;
  page?: number;
};

const TAKE = 20;
// Utilization is a ratio of two columns (usedSeats/purchasedSeats), which
// Prisma's query builder cannot filter on directly (no cross-column
// comparison in `where`). Plan/status filters are real columns and are
// pushed to SQL; search and utilization are applied in JS after one bounded
// fetch, matching the same bounded-fetch-then-filter pattern already used
// elsewhere in this Founder service family (e.g. services/founder-pilots.ts's
// unconditional take: 80) rather than a raw-SQL second query engine. This
// ceiling is a defensive bound, not an expected real portfolio size.
const CANDIDATE_CEILING = 2000;

function planTierFilterFor(bucket: PlanBucket | undefined): Prisma.CustomerAccountWhereInput | undefined {
  if (bucket === 'BUSINESS') return { planTier: 'STARTER' };
  if (bucket === 'ENTERPRISE') return { planTier: 'ENTERPRISE' };
  if (bucket === 'TRIAL_LEGACY') return { planTier: { in: ['FREE_TRIAL', 'GROWTH'] } };
  return undefined;
}

export async function buildSeatsPortfolio(filters: SeatsFilters): Promise<SafeResult<SeatsPortfolio>> {
  const page = Math.max(1, filters.page ?? 1);
  const q = filters.q?.trim().toLowerCase() || undefined;

  const where: Prisma.CustomerAccountWhereInput = {};
  const planFilter = planTierFilterFor(filters.plan);
  if (planFilter) Object.assign(where, planFilter);
  if (filters.status) where.status = filters.status;

  try {
    const [candidates, totalCustomers, seatTotalsAgg, allSeatAllocations, recentSeatChangeLogs] = await Promise.all([
      prisma.customerAccount.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: CANDIDATE_CEILING,
        include: {
          seatAllocation: true,
          health: { select: { approvalsProcessed: true, integrationsConnected: true, lastLoginAt: true } },
        },
      }),
      prisma.customerAccount.count(),
      prisma.customerSeatAllocation.aggregate({ _sum: { purchasedSeats: true, allocatedSeats: true, usedSeats: true } }),
      // Lightweight, unfiltered scan for the capacity-bucket KPIs, the
      // honest per-customer capacity-overview totals, and the top-pressure
      // ranking — portfolio-wide, matching Plans & Billing's own KPI
      // convention of computing headline numbers from the full dataset
      // regardless of the table's active filters. Includes the minimal
      // company identity fields needed for the top-pressure list so no
      // second, per-row lookup is ever needed for it.
      prisma.customerSeatAllocation.findMany({
        select: {
          purchasedSeats: true,
          usedSeats: true,
          customerAccountId: true,
          customerAccount: { select: { companyName: true, domain: true } },
        },
      }),
      // Real seat-change history for the command panel — the exact same
      // FounderAuditLog rows updateCustomerSeats() already writes via
      // logFounderAction(), never a second audit trail.
      prisma.founderAuditLog.findMany({
        where: { action: 'customer.seats.updated' },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          createdAt: true,
          actorEmail: true,
          metadata: true,
          customerAccountId: true,
          customerAccount: { select: { companyName: true } },
        },
      }),
    ]);

    const candidateIds = candidates.map((c) => c.id);
    const userStatusGroups = candidateIds.length
      ? await prisma.founderManagedUser.groupBy({
          by: ['customerAccountId', 'status'],
          where: { customerAccountId: { in: candidateIds } },
          _count: { _all: true },
        })
      : [];
    const statusCountsByCustomer = new Map<string, Record<string, number>>();
    for (const group of userStatusGroups) {
      const existing = statusCountsByCustomer.get(group.customerAccountId) ?? {};
      existing[group.status] = group._count._all;
      statusCountsByCustomer.set(group.customerAccountId, existing);
    }

    const allRows: SeatsRow[] = candidates.map((customer) => {
      const purchasedSeats = customer.seatAllocation?.purchasedSeats ?? 0;
      const allocatedSeats = customer.seatAllocation?.allocatedSeats ?? 0;
      const usedSeats = customer.seatAllocation?.usedSeats ?? 0;
      const statusCounts = statusCountsByCustomer.get(customer.id) ?? {};
      const totalUsers = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);
      return {
        id: customer.id,
        companyName: customer.companyName,
        domain: customer.domain,
        primaryAdminEmail: customer.primaryAdminEmail,
        planTier: customer.planTier,
        status: customer.status,
        purchasedSeats,
        allocatedSeats,
        usedSeats,
        availableSeats: computeAvailableSeats(usedSeats, purchasedSeats),
        utilizationPercent: computeUtilizationPercent(usedSeats, purchasedSeats),
        utilizationBucket: utilizationBucketFor(usedSeats, purchasedSeats),
        updatedAt: customer.updatedAt,
        createdAt: customer.createdAt,
        invitedUsers: statusCounts.INVITED ?? 0,
        suspendedUsers: statusCounts.SUSPENDED ?? 0,
        totalUsers,
        approvalsProcessed: customer.health?.approvalsProcessed ?? null,
        integrationsConnected: customer.health?.integrationsConnected ?? null,
        lastLoginAt: customer.health?.lastLoginAt ?? null,
      };
    });

    const filteredRows = allRows.filter((row) => {
      if (q) {
        const haystack = `${row.companyName} ${row.domain} ${row.primaryAdminEmail}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.utilization && row.utilizationBucket !== filters.utilization) return false;
      return true;
    });

    const filteredTotal = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(filteredTotal / TAKE));
    const skip = (page - 1) * TAKE;
    const rows = filteredRows.slice(skip, skip + TAKE);

    let nearCapacityCount = 0;
    let overCapacityCount = 0;
    let noUsageCount = 0;
    let healthyCount = 0;
    let usedWithinPurchasedTotal = 0;
    let availableTotal = 0;
    let overCapacityTotal = 0;
    const pressureCandidates: TopPressureRow[] = [];
    for (const alloc of allSeatAllocations) {
      const bucket = utilizationBucketFor(alloc.usedSeats, alloc.purchasedSeats);
      if (bucket === 'EIGHTY_TO_99' || bucket === 'AT_CAPACITY') nearCapacityCount += 1;
      else if (bucket === 'OVER_CAPACITY') overCapacityCount += 1;
      else if (bucket === 'UNDER_50' || bucket === 'FIFTY_TO_79') healthyCount += 1;
      if (alloc.usedSeats === 0) noUsageCount += 1;

      usedWithinPurchasedTotal += Math.min(alloc.usedSeats, alloc.purchasedSeats);
      availableTotal += Math.max(alloc.purchasedSeats - alloc.usedSeats, 0);
      overCapacityTotal += Math.max(alloc.usedSeats - alloc.purchasedSeats, 0);

      if (bucket !== null) {
        pressureCandidates.push({
          id: alloc.customerAccountId,
          companyName: alloc.customerAccount.companyName,
          domain: alloc.customerAccount.domain,
          purchasedSeats: alloc.purchasedSeats,
          usedSeats: alloc.usedSeats,
          utilizationPercent: computeUtilizationPercent(alloc.usedSeats, alloc.purchasedSeats),
          utilizationBucket: bucket,
        });
      }
    }
    const topPressure = pressureCandidates
      .sort((a, b) => (b.utilizationPercent ?? 0) - (a.utilizationPercent ?? 0))
      .slice(0, 5);

    const recentSeatChanges: SeatChangeAuditRow[] = recentSeatChangeLogs.map((log) => {
      const metadata = log.metadata as { purchasedSeats?: number; activeUsers?: number } | null;
      return {
        id: log.id,
        createdAt: log.createdAt,
        actorEmail: log.actorEmail,
        companyName: log.customerAccount?.companyName ?? null,
        customerAccountId: log.customerAccountId,
        purchasedSeats: typeof metadata?.purchasedSeats === 'number' ? metadata.purchasedSeats : null,
        activeUsers: typeof metadata?.activeUsers === 'number' ? metadata.activeUsers : null,
      };
    });

    const purchasedSeatsTotal = seatTotalsAgg._sum.purchasedSeats ?? 0;
    const usedSeatsTotal = seatTotalsAgg._sum.usedSeats ?? 0;

    return {
      migrationRequired: false,
      data: {
        rows,
        kpis: {
          purchasedSeatsTotal,
          allocatedSeatsTotal: seatTotalsAgg._sum.allocatedSeats ?? 0,
          usedSeatsTotal,
          availableSeatsTotal: purchasedSeatsTotal - usedSeatsTotal,
          overallUtilizationPercent: computeUtilizationPercent(usedSeatsTotal, purchasedSeatsTotal),
          healthyCount,
          nearCapacityCount,
          overCapacityCount,
          noUsageCount,
        },
        capacityOverview: { usedWithinPurchasedTotal, availableTotal, overCapacityTotal },
        topPressure,
        recentSeatChanges,
        page,
        totalPages,
        totalCustomers: filteredTotal,
        hasAnyCustomers: totalCustomers > 0,
      },
    };
  } catch (error) {
    return {
      migrationRequired: missingFounderStorage(error),
      safeError: safeErrorMessage(error),
      data: {
        rows: [],
        kpis: { purchasedSeatsTotal: 0, allocatedSeatsTotal: 0, usedSeatsTotal: 0, availableSeatsTotal: 0, overallUtilizationPercent: null, healthyCount: 0, nearCapacityCount: 0, overCapacityCount: 0, noUsageCount: 0 },
        capacityOverview: { usedWithinPurchasedTotal: 0, availableTotal: 0, overCapacityTotal: 0 },
        topPressure: [],
        recentSeatChanges: [],
        page: 1,
        totalPages: 1,
        totalCustomers: 0,
        hasAnyCustomers: false,
      },
    };
  }
}
