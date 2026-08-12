import type { Prisma } from '@prisma/client';
import { unstable_cache, revalidateTag } from 'next/cache';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { isConnectionPoolError } from '@/lib/prisma-errors';
import { withTimeout } from '@/lib/performance';
import { toDate } from '@/lib/types/dates';

export * from '@/services/onboarding-shared';
import { onboardingStepKeys, onboardingStepLabels } from '@/services/onboarding-shared';
import type { OnboardingStepKey, TeamInviteDraft, IntegrationDraft, PlaybookDraft, CopilotSetupDraft, OnboardingPatch } from '@/services/onboarding-shared';

export function normalizeStep(step: unknown) {
  const parsed = Number(step);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(10, Math.max(1, Math.round(parsed)));
}

export function stepKeyForIndex(step: number): OnboardingStepKey {
  return onboardingStepKeys[normalizeStep(step) - 1] ?? 'organization';
}

function jsonArray<T>(value: Prisma.JsonValue | null | undefined): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function jsonObject<T extends Record<string, unknown>>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : fallback;
}

export function calculateOnboardingReadiness(input: {
  name?: string | null;
  companyDomain?: string | null;
  industry?: string | null;
  companySize?: string | null;
  country?: string | null;
  primaryAdminName?: string | null;
  primaryAdminEmail?: string | null;
  invitedTeamMembers?: Prisma.JsonValue | null;
  departments?: string[];
  approvalCategories?: string[];
  integrationSetup?: Prisma.JsonValue | null;
  playbookSetup?: Prisma.JsonValue | null;
  copilotSetup?: Prisma.JsonValue | null;
  memoryGraphInitializedAt?: Date | null;
  onboardedAt?: Date | null;
}) {
  const invited = jsonArray<TeamInviteDraft>(input.invitedTeamMembers);
  const integrations = jsonArray<IntegrationDraft>(input.integrationSetup);
  const playbooks = jsonArray<PlaybookDraft>(input.playbookSetup);
  const copilot = jsonObject<CopilotSetupDraft>(input.copilotSetup, { dataSources: [], permissions: [], scope: '' });

  const checks = [
    {
      key: 'organization' as const,
      label: onboardingStepLabels.organization,
      complete: Boolean(input.name && input.companyDomain && input.industry && input.companySize && input.country && input.primaryAdminName && input.primaryAdminEmail),
    },
    { key: 'team' as const, label: onboardingStepLabels.team, complete: invited.length > 0 },
    { key: 'departments' as const, label: onboardingStepLabels.departments, complete: (input.departments?.length ?? 0) > 0 },
    { key: 'categories' as const, label: onboardingStepLabels.categories, complete: (input.approvalCategories?.length ?? 0) > 0 },
    {
      key: 'integrations' as const,
      label: onboardingStepLabels.integrations,
      complete: integrations.length > 0 && integrations.every((item) => item.status === 'Connected' || item.status === 'Skipped'),
    },
    { key: 'playbooks' as const, label: onboardingStepLabels.playbooks, complete: playbooks.length > 0 },
    { key: 'memory' as const, label: onboardingStepLabels.memory, complete: Boolean(input.memoryGraphInitializedAt) },
    { key: 'copilot' as const, label: onboardingStepLabels.copilot, complete: copilot.dataSources.length > 0 && copilot.permissions.length > 0 && Boolean(copilot.scope) },
  ];

  const completed = checks.filter((check) => check.complete);
  const score = Math.round((completed.length / checks.length) * 100);
  return { score: input.onboardedAt ? 100 : score, checks, completedStepKeys: completed.map((check) => check.key) };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Cache tag / invalidation ------------------------------------------
export function onboardingStateCacheTag(organizationId: string) {
  return `onboarding-state-${organizationId}`;
}

/** Safe to call from any context - never throws outside a Next.js server request scope. */
export function invalidateOnboardingStateCache(organizationId: string) {
  try {
    revalidateTag(onboardingStateCacheTag(organizationId));
  } catch (error) {
    console.warn('[onboarding] cache invalidation skipped (no Next.js server request scope)', error instanceof Error ? error.message : error);
  }
}

// --- Circuit breaker -----------------------------------------------------
// Mirrors the pattern already used across lib/auth.ts, lib/approvalRecords.ts,
// services/alerts.ts, and services/memory.ts this session, for consistency.
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;
let consecutiveOnboardingFailures = 0;
let onboardingBreakerOpenUntil = 0;

function isOnboardingBreakerOpen() {
  return Date.now() < onboardingBreakerOpenUntil;
}

function recordOnboardingSuccess() {
  consecutiveOnboardingFailures = 0;
  onboardingBreakerOpenUntil = 0;
}

function recordOnboardingFailure() {
  consecutiveOnboardingFailures += 1;
  if (consecutiveOnboardingFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    onboardingBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  }
}

class OnboardingCircuitOpenError extends Error {
  constructor() {
    super('Onboarding state lookup is temporarily paused after repeated database failures.');
    this.name = 'OnboardingCircuitOpenError';
  }
}

const ONBOARDING_QUERY_TIMEOUT_MS = 3000;
const ONBOARDING_TOTAL_FETCH_TIMEOUT_MS = 5000;
const ONBOARDING_REVALIDATE_SECONDS = 300;

type OnboardingStateFresh = Awaited<ReturnType<typeof fetchOnboardingStateFresh>>;

async function fetchOnboardingStateFresh(organizationId: string) {
  if (isOnboardingBreakerOpen()) {
    throw new OnboardingCircuitOpenError();
  }

  const attempt = () =>
    Promise.all([
      withTimeout('onboarding:organization', prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }), ONBOARDING_QUERY_TIMEOUT_MS),
      withTimeout(
        'onboarding:integrations',
        prisma.integration.findMany({
          where: { organizationId },
          select: { provider: true, status: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
        }),
        ONBOARDING_QUERY_TIMEOUT_MS,
      ).catch(() => [] as Array<{ provider: string; status: string; updatedAt: Date }>),
      // A count, not a findMany - seatUsage.used must be an exact seat count,
      // never a row list capped by `take`, or the seat count would silently
      // under-report for any org with more users than the cap.
      withTimeout('onboarding:userCount', prisma.user.count({ where: { organizationId } }), ONBOARDING_QUERY_TIMEOUT_MS).catch(() => 0),
      withTimeout('onboarding:adminCount', prisma.user.count({ where: { organizationId, role: { in: ['OWNER', 'ADMIN'] } } }), ONBOARDING_QUERY_TIMEOUT_MS).catch(() => 0),
      withTimeout(
        'onboarding:playbookDocuments',
        prisma.playbookDocument.findMany({
          where: { organizationId },
          select: { id: true, name: true, status: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
        }),
        ONBOARDING_QUERY_TIMEOUT_MS,
      ).catch(() => [] as Array<{ id: string; name: string; status: string; updatedAt: Date }>),
    ]);

  try {
    // One quick retry on a connection-pool-shaped error - self-heals a
    // single transient blip within the same request.
    const [organization, integrations, usedSeats, adminSeats, playbookDocuments] = await attempt().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!isConnectionPoolError(message) && !message.includes('timed out')) throw error;
      await sleep(300);
      return attempt();
    });

    recordOnboardingSuccess();

    const readiness = calculateOnboardingReadiness(organization);
    return {
      organization,
      readiness,
      integrations,
      playbookDocuments,
      seatUsage: {
        used: usedSeats,
        admins: adminSeats,
        invited: jsonArray<TeamInviteDraft>(organization.invitedTeamMembers).length,
      },
    };
  } catch (error) {
    recordOnboardingFailure();
    throw error;
  }
}

/**
 * Cross-request cache - the same fix already applied to getDashboardTenant(),
 * loadDashboardApprovalRecords(), getApprovalAlerts(), and
 * buildMemoryDashboard() this session: previously this ran on every page
 * load with zero caching, and a single slow query (prisma.user.findMany()
 * fetching every user row just to count it in JS) propagated an unhandled
 * PrismaClientKnownRequestError straight to Sentry. Constructing the wrapped
 * function per organizationId is the documented Next.js pattern for a
 * per-entity dynamic cache tag.
 */
function getCachedOnboardingStateFetcher(organizationId: string) {
  return unstable_cache(
    () => fetchOnboardingStateFresh(organizationId),
    ['onboarding-state', organizationId],
    { revalidate: ONBOARDING_REVALIDATE_SECONDS, tags: [onboardingStateCacheTag(organizationId)] },
  );
}

/**
 * unstable_cache serializes its return value to JSON - every Date field
 * (organization.createdAt/updatedAt/onboardingStartedAt/onboardingLastSavedAt/
 * memoryGraphInitializedAt/onboardedAt, plus each integration's and playbook
 * document's updatedAt) comes back as an ISO string on a cache hit even
 * though the Prisma-inferred type still claims they're Date objects.
 * Applied unconditionally, matching the fix already applied elsewhere this
 * session.
 */
function deserializeOnboardingState(state: OnboardingStateFresh): OnboardingStateFresh {
  return {
    ...state,
    organization: {
      ...state.organization,
      createdAt: toDate(state.organization.createdAt),
      updatedAt: toDate(state.organization.updatedAt),
      onboardingStartedAt: toDate(state.organization.onboardingStartedAt),
      onboardingLastSavedAt: toDate(state.organization.onboardingLastSavedAt),
      memoryGraphInitializedAt: toDate(state.organization.memoryGraphInitializedAt),
      onboardedAt: toDate(state.organization.onboardedAt),
    },
    integrations: state.integrations.map((item) => ({ ...item, updatedAt: toDate(item.updatedAt) })),
    playbookDocuments: state.playbookDocuments.map((item) => ({ ...item, updatedAt: toDate(item.updatedAt) })),
  };
}

// Per-request dedup on top of the cross-request cache above.
const getOnboardingStateForRequest = cache(async (organizationId: string) => {
  const state = await getCachedOnboardingStateFetcher(organizationId)();
  return deserializeOnboardingState(state);
});

// --- Tier-2 "last known good" store --------------------------------------
// Same pattern as the other services fixed this session: unstable_cache has
// no stale-if-error primitive, so this small imperative store exists purely
// to serve the last successful result when a fresh fetch fails.
type LastGoodEntry = { state: OnboardingStateFresh; cachedAt: number };
const STALE_CACHE_TTL_MS = 10 * 60 * 1000;

const globalForOnboarding = globalThis as unknown as {
  approvlineOnboardingLastGood?: Map<string, LastGoodEntry>;
};

function lastGoodStore() {
  globalForOnboarding.approvlineOnboardingLastGood ??= new Map();
  return globalForOnboarding.approvlineOnboardingLastGood;
}

export async function buildOnboardingState(organizationId: string): Promise<
  OnboardingStateFresh & { degraded: boolean; alert: boolean; staleAsOfMs?: number; message?: string }
> {
  try {
    const state = await withTimeout('onboarding state (total)', getOnboardingStateForRequest(organizationId), ONBOARDING_TOTAL_FETCH_TIMEOUT_MS);
    lastGoodStore().set(organizationId, { state, cachedAt: Date.now() });
    return { ...state, degraded: false, alert: false };
  } catch (error) {
    console.error('[onboarding] state fetch failed', error);

    // The degraded message is reserved for a database that has actually
    // been unreachable for 3+ consecutive attempts (breaker open) - a
    // single slow query must never alarm the user, even if it means
    // falling back to a slightly stale (but real) result.
    const alert = isOnboardingBreakerOpen();

    const lastGood = lastGoodStore().get(organizationId);
    if (lastGood && Date.now() - lastGood.cachedAt < STALE_CACHE_TTL_MS) {
      return {
        ...lastGood.state,
        degraded: alert,
        alert,
        staleAsOfMs: lastGood.cachedAt,
        message: alert ? 'Live database results are delayed, so recently loaded onboarding status is shown instead.' : undefined,
      };
    }

    // No cache to fall back on (e.g. a genuinely missing table): let this
    // propagate. app/settings/onboarding/page.tsx distinguishes a migration
    // error from a transient one and renders an inline notice either way -
    // it never reaches Sentry as an unhandled crash.
    throw error;
  }
}

export async function saveOnboardingPatch(input: {
  organizationId: string;
  actorUserId?: string | null;
  patch: OnboardingPatch;
}) {
  const current = await prisma.organization.findUniqueOrThrow({ where: { id: input.organizationId } });
  const now = new Date();
  const completed = new Set(current.onboardingCompletedSteps ?? []);
  if (input.patch.completedStep) completed.add(input.patch.completedStep);

  const data: Prisma.OrganizationUpdateInput = {
    onboardingLastSavedAt: now,
    onboardingStartedAt: current.onboardingStartedAt ?? now,
  };

  if (input.patch.step) data.onboardingStep = normalizeStep(input.patch.step);
  if (input.patch.organization) {
    const org = input.patch.organization;
    if (org.name !== undefined) data.name = org.name.trim() || current.name;
    if (org.companyDomain !== undefined) data.companyDomain = org.companyDomain.trim().toLowerCase();
    if (org.industry !== undefined) data.industry = org.industry.trim();
    if (org.companySize !== undefined) data.companySize = org.companySize.trim();
    if (org.country !== undefined) data.country = org.country.trim();
    if (org.primaryAdminName !== undefined) data.primaryAdminName = org.primaryAdminName.trim();
    if (org.primaryAdminEmail !== undefined) data.primaryAdminEmail = org.primaryAdminEmail.trim().toLowerCase();
  }
  if (input.patch.invitedTeamMembers) data.invitedTeamMembers = input.patch.invitedTeamMembers as unknown as Prisma.InputJsonValue;
  if (input.patch.departments) data.departments = input.patch.departments.map((item) => item.trim()).filter(Boolean);
  if (input.patch.approvalCategories) data.approvalCategories = input.patch.approvalCategories.map((item) => item.trim()).filter(Boolean);
  if (input.patch.integrationSetup) data.integrationSetup = input.patch.integrationSetup as unknown as Prisma.InputJsonValue;
  if (input.patch.playbookSetup) data.playbookSetup = input.patch.playbookSetup as unknown as Prisma.InputJsonValue;
  if (input.patch.copilotSetup) data.copilotSetup = input.patch.copilotSetup as unknown as Prisma.InputJsonValue;
  if (input.patch.memoryGraphInitialized) data.memoryGraphInitializedAt = current.memoryGraphInitializedAt ?? now;
  if (input.patch.complete) data.onboardedAt = now;

  data.onboardingCompletedSteps = [...completed];

  const updated = await prisma.organization.update({ where: { id: input.organizationId }, data });
  const readiness = calculateOnboardingReadiness(updated);

  await prisma.organization.update({
    where: { id: input.organizationId },
    data: {
      onboardingReadinessScore: input.patch.complete ? 100 : readiness.score,
      onboardingStatus: {
        score: input.patch.complete ? 100 : readiness.score,
        completedSteps: readiness.completedStepKeys,
        lastAction: input.patch.complete ? 'completed' : 'saved',
        lastSavedAt: now.toISOString(),
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      action: input.patch.complete ? 'onboarding.completed' : 'onboarding.step_saved',
      metadata: {
        step: input.patch.completedStep ?? stepKeyForIndex(input.patch.step ?? updated.onboardingStep),
        readinessScore: input.patch.complete ? 100 : readiness.score,
      },
    },
  });

  // Bust the cache before re-reading - otherwise the call below could
  // legitimately serve the pre-write cached state right back.
  invalidateOnboardingStateCache(input.organizationId);
  return buildOnboardingState(input.organizationId);
}
