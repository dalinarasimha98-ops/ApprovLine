/**
 * Revenue (/founder/revenue) — Founder commercial position control surface.
 * Built entirely on the existing CustomerAccount / CustomerSeatAllocation
 * records; introduces no new revenue, billing, or subscription model.
 *
 * ARCHITECTURE AUDIT — revenue source of truth (do not assume otherwise
 * without re-checking the schema and every write call site):
 *
 *   - CustomerAccount.estimatedArrUsd is the ONLY commercial figure this
 *     codebase tracks. It is Founder-entered exactly once, at provisioning
 *     time (services/founder.ts's provisionFounderCustomer, reading
 *     formData's "estimatedArrUsd" field), validated (> 0, <=
 *     lib/plans.ts's MAX_ESTIMATED_ARR_USD), and persisted. Grepping this
 *     entire repository for every assignment to estimatedArrUsd confirms
 *     there is no second write path anywhere — not in
 *     updateCustomerAccountDetails (which updates planTier/status/seats/
 *     etc. but never touches estimatedArrUsd), not in any seat, feature,
 *     or integration mutation. This module is therefore READ-ONLY for
 *     ARR: there is no canonical mutation to reuse, and per this task's
 *     own instruction, one is not fabricated here.
 *   - The Prisma `Subscription` model (stripeCustomerId/
 *     stripeSubscriptionId/status/plan/currentPeriodEnd) is dead schema —
 *     zero write call sites anywhere in the codebase (confirmed by
 *     grepping for `subscription.create|update|upsert`; the model is only
 *     ever read defensively, and unreachably, by lib/entitlements.ts and
 *     services/customerSuccess.ts once a CustomerAccount exists — see
 *     services/founder-billing.ts's identical prior finding). This module
 *     does not read, write, or build on Subscription.
 *   - There is no MRR, invoice, payment, collections, or contract-period
 *     concept implemented anywhere in ApprovLine today. Revenue Status is
 *     therefore a two-value label (Recorded Estimate / No Estimate)
 *     describing whether an estimate exists, never a payment state.
 *   - The PRE-EXISTING /founder/revenue page (replaced by this module) was
 *     built on services/founder-pilots.ts's PilotListItem.expectedArr — a
 *     separate pipeline/pilot-forecast concept for a different page
 *     (/founder/pilots, still linked from Overview, Go-Live Readiness, and
 *     Provision Customer) — and fabricated Plan, Seats, and Discount from
 *     ARR-bucket heuristics with no backing field. This module replaces
 *     that with the real, authoritative CustomerAccount record instead.
 *
 * Every filter here (search, plan, status, revenue coverage) is a real
 * column or simple null-check, so — unlike Seats & Usage's utilization
 * ratio, which Prisma cannot express in `where` — all of it is pushed to
 * SQL directly with real server-side pagination, matching Plans & Billing's
 * exact query shape rather than Seats & Usage's bounded-fetch-then-filter
 * workaround (not needed here; simpler is correct here).
 */
import { prisma } from '@/lib/prisma';
import type { CustomerAccountStatus, CustomerPlanTier, Prisma } from '@prisma/client';
import type { PlanBucket, RevenueCoverage } from '@/lib/founder-revenue';
import { arrCoveragePercent } from '@/lib/founder-revenue';

type SafeResult<T> = { data: T; migrationRequired: boolean; safeError?: string };

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').slice(0, 320);
  return String(error).slice(0, 320);
}

function missingFounderStorage(error: unknown): boolean {
  const message = safeErrorMessage(error);
  return message.includes('does not exist') || message.includes('CustomerAccount') || message.includes('CustomerSeatAllocation');
}

export type RevenueRow = {
  id: string;
  companyName: string;
  domain: string;
  primaryAdminEmail: string;
  planTier: CustomerPlanTier;
  status: CustomerAccountStatus;
  estimatedArrUsd: number | null;
  purchasedSeats: number;
  allocatedSeats: number;
  usedSeats: number;
  internalNotes: string | null;
  updatedAt: Date;
  createdAt: Date;
};

export type RevenueKpis = {
  estimatedArrTotal: number;
  activeEstimatedArrTotal: number;
  customersWithArr: number;
  totalCustomers: number;
  arrCoveragePercent: number | null;
  businessCount: number;
  enterpriseCount: number;
};

export type RevenuePlanMixEntry = {
  bucket: PlanBucket;
  label: string;
  customerCount: number;
  estimatedArrTotal: number;
};

export type RevenueAttention = {
  /** estimatedArrUsd is null, across the whole portfolio (unfiltered). */
  missingArrCount: number;
  /** status = ACTIVE and estimatedArrUsd is null. */
  activeWithoutArrCount: number;
  /** status in (SUSPENDED, CHURNED) and estimatedArrUsd is not null — not labeled "lost revenue": that concept has no backing data. */
  inactiveWithArrCount: number;
};

export type RevenuePortfolio = {
  rows: RevenueRow[];
  kpis: RevenueKpis;
  planMix: RevenuePlanMixEntry[];
  attention: RevenueAttention;
  page: number;
  totalPages: number;
  totalCustomers: number;
  /** True unfiltered baseline — distinguishes "no customers at all" from "filters matched nothing" (same fix as Customer Integrations / Seats & Usage). */
  hasAnyCustomers: boolean;
};

export type RevenueFilters = {
  q?: string;
  plan?: PlanBucket;
  status?: CustomerAccountStatus;
  coverage?: RevenueCoverage;
  /**
   * A named drill-down that doesn't map onto a single status/coverage
   * value — currently only 'inactive_with_arr' (status in SUSPENDED or
   * CHURNED, with a recorded estimate), which the plain single-select
   * status filter can't express as one value. Overrides `status` and
   * `coverage` when present so the two never silently disagree.
   */
  attention?: 'inactive_with_arr';
  page?: number;
};

const TAKE = 20;

function planTierFilterFor(bucket: PlanBucket | undefined): Prisma.CustomerAccountWhereInput | undefined {
  if (bucket === 'BUSINESS') return { planTier: 'STARTER' };
  if (bucket === 'ENTERPRISE') return { planTier: 'ENTERPRISE' };
  if (bucket === 'TRIAL_LEGACY') return { planTier: { in: ['FREE_TRIAL', 'GROWTH'] } };
  return undefined;
}

function coverageFilterFor(coverage: RevenueCoverage | undefined): Prisma.CustomerAccountWhereInput | undefined {
  if (coverage === 'RECORDED') return { estimatedArrUsd: { not: null } };
  if (coverage === 'MISSING') return { estimatedArrUsd: null };
  return undefined;
}

const EMPTY_PORTFOLIO: RevenuePortfolio = {
  rows: [],
  kpis: { estimatedArrTotal: 0, activeEstimatedArrTotal: 0, customersWithArr: 0, totalCustomers: 0, arrCoveragePercent: null, businessCount: 0, enterpriseCount: 0 },
  planMix: [
    { bucket: 'BUSINESS', label: 'Business', customerCount: 0, estimatedArrTotal: 0 },
    { bucket: 'ENTERPRISE', label: 'Enterprise', customerCount: 0, estimatedArrTotal: 0 },
    { bucket: 'TRIAL_LEGACY', label: 'Trial / Legacy', customerCount: 0, estimatedArrTotal: 0 },
  ],
  attention: { missingArrCount: 0, activeWithoutArrCount: 0, inactiveWithArrCount: 0 },
  page: 1,
  totalPages: 1,
  totalCustomers: 0,
  hasAnyCustomers: false,
};

export async function buildRevenuePortfolio(filters: RevenueFilters): Promise<SafeResult<RevenuePortfolio>> {
  const page = Math.max(1, filters.page ?? 1);
  const skip = (page - 1) * TAKE;
  const q = filters.q?.trim() || undefined;

  const where: Prisma.CustomerAccountWhereInput = {};
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: 'insensitive' } },
      { domain: { contains: q, mode: 'insensitive' } },
      { primaryAdminEmail: { contains: q, mode: 'insensitive' } },
    ];
  }
  const planFilter = planTierFilterFor(filters.plan);
  if (planFilter) Object.assign(where, planFilter);
  if (filters.attention === 'inactive_with_arr') {
    // Overrides status/coverage rather than combining with them: this is a
    // named drill-down, not a composable filter, so it always means
    // exactly one thing regardless of what stale status/coverage values a
    // caller might also pass.
    where.status = { in: ['SUSPENDED', 'CHURNED'] };
    where.estimatedArrUsd = { not: null };
  } else {
    if (filters.status) where.status = filters.status;
    const coverageFilter = coverageFilterFor(filters.coverage);
    if (coverageFilter) Object.assign(where, coverageFilter);
  }

  try {
    const [
      customers,
      filteredTotal,
      totalCustomers,
      estimatedArrAgg,
      activeArrAgg,
      customersWithArr,
      planGroups,
      missingArrCount,
      activeWithoutArrCount,
      inactiveWithArrCount,
    ] = await Promise.all([
      prisma.customerAccount.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: TAKE,
        include: { seatAllocation: true },
      }),
      prisma.customerAccount.count({ where }),
      prisma.customerAccount.count(),
      // Unfiltered portfolio-wide KPIs, matching Plans & Billing's own
      // convention of computing headline numbers from the full dataset
      // regardless of the table's active filters.
      prisma.customerAccount.aggregate({ _sum: { estimatedArrUsd: true } }),
      prisma.customerAccount.aggregate({ where: { status: 'ACTIVE' }, _sum: { estimatedArrUsd: true } }),
      prisma.customerAccount.count({ where: { estimatedArrUsd: { not: null } } }),
      prisma.customerAccount.groupBy({ by: ['planTier'], _count: { _all: true }, _sum: { estimatedArrUsd: true } }),
      prisma.customerAccount.count({ where: { estimatedArrUsd: null } }),
      prisma.customerAccount.count({ where: { status: 'ACTIVE', estimatedArrUsd: null } }),
      prisma.customerAccount.count({ where: { status: { in: ['SUSPENDED', 'CHURNED'] }, estimatedArrUsd: { not: null } } }),
    ]);

    const countForTier = (tier: CustomerPlanTier) => planGroups.find((g) => g.planTier === tier)?._count._all ?? 0;
    const arrForTier = (tier: CustomerPlanTier) => planGroups.find((g) => g.planTier === tier)?._sum.estimatedArrUsd ?? 0;
    const businessCount = countForTier('STARTER');
    const enterpriseCount = countForTier('ENTERPRISE');
    const trialLegacyCount = countForTier('FREE_TRIAL') + countForTier('GROWTH');
    const trialLegacyArr = arrForTier('FREE_TRIAL') + arrForTier('GROWTH');

    const rows: RevenueRow[] = customers.map((customer) => ({
      id: customer.id,
      companyName: customer.companyName,
      domain: customer.domain,
      primaryAdminEmail: customer.primaryAdminEmail,
      planTier: customer.planTier,
      status: customer.status,
      estimatedArrUsd: customer.estimatedArrUsd,
      purchasedSeats: customer.seatAllocation?.purchasedSeats ?? 0,
      allocatedSeats: customer.seatAllocation?.allocatedSeats ?? 0,
      usedSeats: customer.seatAllocation?.usedSeats ?? 0,
      internalNotes: customer.internalNotes,
      updatedAt: customer.updatedAt,
      createdAt: customer.createdAt,
    }));

    return {
      migrationRequired: false,
      data: {
        rows,
        kpis: {
          estimatedArrTotal: estimatedArrAgg._sum.estimatedArrUsd ?? 0,
          activeEstimatedArrTotal: activeArrAgg._sum.estimatedArrUsd ?? 0,
          customersWithArr,
          totalCustomers,
          arrCoveragePercent: arrCoveragePercent(customersWithArr, totalCustomers),
          businessCount,
          enterpriseCount,
        },
        planMix: [
          { bucket: 'BUSINESS', label: 'Business', customerCount: businessCount, estimatedArrTotal: arrForTier('STARTER') },
          { bucket: 'ENTERPRISE', label: 'Enterprise', customerCount: enterpriseCount, estimatedArrTotal: arrForTier('ENTERPRISE') },
          { bucket: 'TRIAL_LEGACY', label: 'Trial / Legacy', customerCount: trialLegacyCount, estimatedArrTotal: trialLegacyArr },
        ],
        attention: { missingArrCount, activeWithoutArrCount, inactiveWithArrCount },
        page,
        totalPages: Math.max(1, Math.ceil(filteredTotal / TAKE)),
        totalCustomers: filteredTotal,
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
