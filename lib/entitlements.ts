import type { CustomerPlanTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type EntitlementKey =
  | "copilot"
  | "playbook_ai"
  | "investigations"
  | "executive_roi"
  | "universal_gateway";

const planEntitlements: Record<
  CustomerPlanTier,
  ReadonlySet<EntitlementKey>
> = {
  FREE_TRIAL: new Set([
    "copilot",
    "playbook_ai",
    "investigations",
    "executive_roi",
    "universal_gateway",
  ]),
  STARTER: new Set(["executive_roi"]),
  GROWTH: new Set([
    "copilot",
    "playbook_ai",
    "investigations",
    "executive_roi",
  ]),
  ENTERPRISE: new Set([
    "copilot",
    "playbook_ai",
    "investigations",
    "executive_roi",
    "universal_gateway",
  ]),
};

export function isPlanEntitled(
  plan: CustomerPlanTier,
  entitlement: EntitlementKey,
) {
  return planEntitlements[plan].has(entitlement);
}

export class EntitlementDeniedError extends Error {
  constructor(public readonly entitlement: EntitlementKey) {
    super(
      `Your workspace plan does not include ${entitlement.replaceAll("_", " ")}.`,
    );
    this.name = "EntitlementDeniedError";
  }
}

function normalizeSubscriptionPlan(
  plan?: string | null,
): CustomerPlanTier | null {
  const normalized = plan?.trim().toUpperCase().replaceAll(" ", "_");
  if (
    normalized === "FREE_TRIAL" ||
    normalized === "STARTER" ||
    normalized === "GROWTH" ||
    normalized === "ENTERPRISE"
  ) {
    return normalized;
  }
  return null;
}

export async function resolveEntitlement(
  organizationId: string,
  entitlement: EntitlementKey,
) {
  const [account, subscription] = await Promise.all([
    prisma.customerAccount.findUnique({
      where: { organizationId },
      select: {
        status: true,
        planTier: true,
        featureFlags: {
          where: { key: entitlement },
          select: { enabled: true },
          take: 1,
        },
      },
    }),
    prisma.subscription.findFirst({
      where: { organizationId, status: { in: ["ACTIVE", "TRIALING"] } },
      orderBy: { updatedAt: "desc" },
      select: { plan: true, status: true },
    }),
  ]);

  if (
    account &&
    (account.status === "SUSPENDED" || account.status === "CHURNED")
  ) {
    return {
      allowed: false,
      plan: account.planTier,
      reason: "workspace_inactive" as const,
    };
  }

  const explicitFlag = account?.featureFlags[0];
  if (explicitFlag) {
    return {
      allowed: explicitFlag.enabled,
      plan:
        account?.planTier ??
        normalizeSubscriptionPlan(subscription?.plan) ??
        "FREE_TRIAL",
      reason: explicitFlag.enabled
        ? ("feature_override_enabled" as const)
        : ("feature_override_disabled" as const),
    };
  }

  const plan =
    account?.planTier ??
    normalizeSubscriptionPlan(subscription?.plan) ??
    "FREE_TRIAL";
  return {
    allowed: isPlanEntitled(plan, entitlement),
    plan,
    reason: "plan_policy" as const,
  };
}

export async function requireEntitlement(
  organizationId: string,
  entitlement: EntitlementKey,
) {
  const result = await resolveEntitlement(organizationId, entitlement);
  if (!result.allowed) throw new EntitlementDeniedError(entitlement);
  return result;
}
