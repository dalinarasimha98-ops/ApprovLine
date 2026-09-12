/**
 * Plans & Billing (/founder/billing) — portfolio-wide commercial control
 * plane. Aggregates the existing CustomerAccount / CustomerSeatAllocation /
 * CustomerFeatureFlag records; introduces no new commercial model.
 *
 * Dead schema note (Plans & Billing architecture audit): the Prisma
 * `Subscription` model (stripeCustomerId/stripeSubscriptionId/status/plan)
 * has zero write call sites anywhere in the codebase — no code path ever
 * creates, updates, or upserts a Subscription row. It is read only
 * defensively by lib/entitlements.ts and services/customerSuccess.ts as an
 * optional fallback that is unreachable once a CustomerAccount exists. This
 * module does not read, write, or build on Subscription — Plans & Billing
 * is built entirely on CustomerAccount, the real, populated commercial
 * record.
 */
import { prisma } from '@/lib/prisma';
import type { CustomerAccountStatus, CustomerPlanTier, Prisma } from '@prisma/client';
import type { PlanBucket } from '@/lib/founder-billing';

type SafeResult<T> = { data: T; migrationRequired: boolean; safeError?: string };

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').slice(0, 320);
  return String(error).slice(0, 320);
}

function missingFounderStorage(error: unknown): boolean {
  const message = safeErrorMessage(error);
  return message.includes('does not exist') || message.includes('CustomerAccount') || message.includes('CustomerSeatAllocation');
}

export type BillingRow = {
  id: string;
  companyName: string;
  domain: string;
  primaryAdminEmail: string;
  planTier: CustomerPlanTier;
  status: CustomerAccountStatus;
  purchasedSeats: number;
  allocatedSeats: number;
  usedSeats: number;
  estimatedArrUsd: number | null;
  createdAt: Date;
  updatedAt: Date;
  featureFlags: { key: string; enabled: boolean; category: string | null }[];
};

export type BillingKpis = {
  totalCustomers: number;
  businessCount: number;
  enterpriseCount: number;
  activeCount: number;
  purchasedSeatsTotal: number;
  estimatedArrTotal: number;
};

export type BillingPortfolio = {
  rows: BillingRow[];
  kpis: BillingKpis;
  planDistribution: { bucket: PlanBucket; label: string; count: number }[];
  page: number;
  totalPages: number;
  totalCustomers: number;
  /** True unfiltered baseline — distinguishes "no customers at all" from "filters matched nothing" (see Customer Integrations' identical fix for this exact class of bug). */
  hasAnyCustomers: boolean;
};

export type BillingFilters = {
  q?: string;
  plan?: PlanBucket;
  status?: CustomerAccountStatus;
  page?: number;
};

const TAKE = 20;

function planTierFilterFor(bucket: PlanBucket | undefined): Prisma.CustomerAccountWhereInput | undefined {
  if (bucket === 'BUSINESS') return { planTier: 'STARTER' };
  if (bucket === 'ENTERPRISE') return { planTier: 'ENTERPRISE' };
  if (bucket === 'TRIAL_LEGACY') return { planTier: { in: ['FREE_TRIAL', 'GROWTH'] } };
  return undefined;
}

export async function buildBillingPortfolio(filters: BillingFilters): Promise<SafeResult<BillingPortfolio>> {
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
  if (filters.status) where.status = filters.status;

  try {
    const [
      customers,
      filteredTotal,
      totalCustomers,
      businessCount,
      enterpriseCount,
      activeCount,
      seatAgg,
      arrAgg,
      planGroups,
    ] = await Promise.all([
      prisma.customerAccount.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: TAKE,
        include: {
          seatAllocation: true,
          featureFlags: { select: { key: true, enabled: true, category: true } },
        },
      }),
      prisma.customerAccount.count({ where }),
      prisma.customerAccount.count(),
      prisma.customerAccount.count({ where: { planTier: 'STARTER' } }),
      prisma.customerAccount.count({ where: { planTier: 'ENTERPRISE' } }),
      prisma.customerAccount.count({ where: { status: 'ACTIVE' } }),
      prisma.customerSeatAllocation.aggregate({ _sum: { purchasedSeats: true } }),
      prisma.customerAccount.aggregate({ _sum: { estimatedArrUsd: true } }),
      prisma.customerAccount.groupBy({ by: ['planTier'], _count: { _all: true } }),
    ]);

    const trialLegacyCount = planGroups
      .filter((g) => g.planTier === 'FREE_TRIAL' || g.planTier === 'GROWTH')
      .reduce((sum, g) => sum + g._count._all, 0);

    const rows: BillingRow[] = customers.map((customer) => ({
      id: customer.id,
      companyName: customer.companyName,
      domain: customer.domain,
      primaryAdminEmail: customer.primaryAdminEmail,
      planTier: customer.planTier,
      status: customer.status,
      purchasedSeats: customer.seatAllocation?.purchasedSeats ?? 0,
      allocatedSeats: customer.seatAllocation?.allocatedSeats ?? 0,
      usedSeats: customer.seatAllocation?.usedSeats ?? 0,
      estimatedArrUsd: customer.estimatedArrUsd,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      featureFlags: customer.featureFlags,
    }));

    return {
      migrationRequired: false,
      data: {
        rows,
        kpis: {
          totalCustomers,
          businessCount,
          enterpriseCount,
          activeCount,
          purchasedSeatsTotal: seatAgg._sum.purchasedSeats ?? 0,
          estimatedArrTotal: arrAgg._sum.estimatedArrUsd ?? 0,
        },
        planDistribution: [
          { bucket: 'BUSINESS', label: 'Business', count: businessCount },
          { bucket: 'ENTERPRISE', label: 'Enterprise', count: enterpriseCount },
          { bucket: 'TRIAL_LEGACY', label: 'Trial / Legacy', count: trialLegacyCount },
        ],
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
      data: {
        rows: [],
        kpis: { totalCustomers: 0, businessCount: 0, enterpriseCount: 0, activeCount: 0, purchasedSeatsTotal: 0, estimatedArrTotal: 0 },
        planDistribution: [
          { bucket: 'BUSINESS', label: 'Business', count: 0 },
          { bucket: 'ENTERPRISE', label: 'Enterprise', count: 0 },
          { bucket: 'TRIAL_LEGACY', label: 'Trial / Legacy', count: 0 },
        ],
        page: 1,
        totalPages: 1,
        totalCustomers: 0,
        hasAnyCustomers: false,
      },
    };
  }
}
