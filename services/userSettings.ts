import { clerkClient, type User as ClerkUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { tenantScopedWhere } from '@/lib/tenant-isolation';
import { writeAuditLog } from '@/services/audit';
import { sourceMeta } from '@/lib/source-badges';
import type { Role } from '@/lib/rbac';
import { DASHBOARD_TENANT_CACHE_TAG } from '@/lib/auth';
import { revalidateTag } from 'next/cache';

/**
 * Data + mutations for the personal "User Settings" page
 * (app/settings/profile/page.tsx) - deliberately separate from
 * services/settings.ts (organization-wide workspace configuration) and
 * services/identity.ts (enterprise SSO administration). Everything here is
 * scoped to the single authenticated user making the request; nothing here
 * ever takes an organizationId or userId as a trusted argument from the
 * client - both always come from getDashboardTenant()'s server-resolved
 * session in the caller.
 *
 * Identity fields (name, email, avatar, password/2FA status, sessions) are
 * owned by Clerk - this file reads and writes them through the Clerk
 * Backend API rather than duplicating identity storage. Only `role` and
 * `organization` membership are ApprovLine's own, read from the existing
 * User/Organization tables.
 */

export type UserSecurityStatus = {
  passwordEnabled: boolean;
  twoFactorEnabled: boolean;
  totpEnabled: boolean;
  backupCodeEnabled: boolean;
  lastSignInAt: Date | null;
};

export type UserSession = {
  id: string;
  isCurrent: boolean;
  status: string;
  lastActiveAt: Date;
  createdAt: Date;
  browserName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  city: string | null;
  country: string | null;
};

export type ConnectedSource = {
  key: string;
  label: string;
  color: string;
  status: 'connected' | 'disconnected';
};

export type UserSettingsProfile = {
  name: string | null;
  email: string;
  imageUrl: string;
  role: Role;
  memberSince: Date;
  organizationName: string;
  organizationSlug: string;
};

export type UserSettingsData = {
  profile: UserSettingsProfile;
  security: { status: UserSecurityStatus | null; error: string | null };
  sessions: { list: UserSession[]; error: string | null };
  connectedSources: { list: ConnectedSource[]; error: string | null };
};

function toSecurityStatus(clerkUser: ClerkUser): UserSecurityStatus {
  return {
    passwordEnabled: clerkUser.passwordEnabled,
    twoFactorEnabled: clerkUser.twoFactorEnabled,
    totpEnabled: clerkUser.totpEnabled,
    backupCodeEnabled: clerkUser.backupCodeEnabled,
    lastSignInAt: clerkUser.lastSignInAt ? new Date(clerkUser.lastSignInAt) : null,
  };
}

/**
 * Fetches everything the User Settings page renders in one pass. Each
 * section (security status, sessions, connected sources) fails
 * independently - a Clerk API hiccup on the sessions list must never take
 * down the rest of an otherwise-working settings page, matching the
 * section-level degrade pattern already used by app/evidence/[id]/page.tsx
 * and the dashboard's approval list.
 */
export async function getUserSettingsData(input: {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  clerkUserId: string;
  role: Role;
  name: string | null;
  createdAt: Date;
  /** The Clerk session id actually serving this request (from auth() in the
   *  caller) - lets the sessions list mark "This device" honestly instead
   *  of guessing. */
  currentSessionId: string | null;
}): Promise<UserSettingsData> {
  const client = await clerkClient();

  let clerkUser: ClerkUser | null = null;
  let clerkUserError: string | null = null;
  try {
    clerkUser = await client.users.getUser(input.clerkUserId);
  } catch (error) {
    console.error('[user-settings] Clerk user lookup failed', error);
    clerkUserError = 'Your account details could not be loaded from your identity provider right now.';
  }

  const profile: UserSettingsProfile = {
    name: input.name,
    email: clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress ?? '',
    imageUrl: clerkUser?.imageUrl ?? '',
    role: input.role,
    memberSince: input.createdAt,
    organizationName: input.organizationName,
    organizationSlug: input.organizationSlug,
  };

  const security: UserSettingsData['security'] = clerkUser
    ? { status: toSecurityStatus(clerkUser), error: null }
    : { status: null, error: clerkUserError };

  let sessions: UserSettingsData['sessions'];
  try {
    const { data } = await client.sessions.getSessionList({ userId: input.clerkUserId, status: 'active' });
    sessions = {
      list: data.map((session) => ({
        id: session.id,
        isCurrent: session.id === input.currentSessionId,
        status: session.status,
        lastActiveAt: new Date(session.lastActiveAt),
        createdAt: new Date(session.createdAt),
        browserName: session.latestActivity?.browserName ?? null,
        deviceType: session.latestActivity?.deviceType ?? null,
        ipAddress: session.latestActivity?.ipAddress ?? null,
        city: session.latestActivity?.city ?? null,
        country: session.latestActivity?.country ?? null,
      })),
      error: null,
    };
  } catch (error) {
    console.error('[user-settings] Clerk session list failed', error);
    sessions = { list: [], error: 'Your active sessions could not be loaded right now.' };
  }

  let connectedSources: UserSettingsData['connectedSources'];
  try {
    const [integrations, evidenceConnections] = await Promise.all([
      prisma.integration.findMany({
        where: tenantScopedWhere({ organizationId: input.organizationId }),
        select: { provider: true, status: true },
      }),
      prisma.evidenceProviderConnection.findMany({
        where: tenantScopedWhere({ organizationId: input.organizationId }),
        select: { providerKey: true, status: true },
      }),
    ]);
    const byKey = new Map<string, ConnectedSource>();
    for (const integration of integrations) {
      const key = integration.provider.toLowerCase();
      const meta = sourceMeta(key);
      byKey.set(key, { key, label: meta.label, color: meta.color, status: integration.status === 'CONNECTED' ? 'connected' : 'disconnected' });
    }
    for (const connection of evidenceConnections) {
      const key = connection.providerKey.toLowerCase();
      const meta = sourceMeta(key);
      const isConnected = connection.status === 'CONNECTED' || connection.status === 'SYNCING' || connection.status === 'DEGRADED';
      const existing = byKey.get(key);
      if (!existing || (isConnected && existing.status === 'disconnected')) {
        byKey.set(key, { key, label: meta.label, color: meta.color, status: isConnected ? 'connected' : 'disconnected' });
      }
    }
    connectedSources = { list: [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label)), error: null };
  } catch (error) {
    console.error('[user-settings] connected sources query failed', error);
    connectedSources = { list: [], error: 'Connected sources could not be loaded right now.' };
  }

  return { profile, security, sessions, connectedSources };
}

export type UpdateProfileNameResult = { ok: true } | { ok: false; error: string };

/**
 * Name is Clerk-owned identity data - updated through the Clerk Backend
 * API (the "correct Clerk update mechanism"), then mirrored into
 * ApprovLine's own User.name so every other page that reads the DB copy
 * (not Clerk directly) sees the change immediately, and the cached tenant
 * record (lib/auth.ts's getDashboardTenant) is invalidated so the very
 * next page load reflects it rather than waiting out its 5-minute revalidate
 * window.
 */
export async function updateProfileName(input: {
  organizationId: string;
  userId: string;
  clerkUserId: string;
  fullName: string;
}): Promise<UpdateProfileNameResult> {
  const trimmed = input.fullName.trim();
  if (!trimmed) return { ok: false, error: 'Enter your name.' };
  if (trimmed.length > 200) return { ok: false, error: 'Name is too long.' };

  const [firstName, ...rest] = trimmed.split(/\s+/);
  const lastName = rest.join(' ') || undefined;

  try {
    const client = await clerkClient();
    await client.users.updateUser(input.clerkUserId, { firstName, lastName });
  } catch (error) {
    console.error('[user-settings] Clerk name update failed', error);
    return { ok: false, error: 'Your name could not be updated right now. Please try again.' };
  }

  await prisma.user.update({ where: { id: input.userId, organizationId: input.organizationId }, data: { name: trimmed } });
  revalidateTag(DASHBOARD_TENANT_CACHE_TAG);
  await writeAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: 'PROFILE_UPDATED',
    metadata: { field: 'name' },
  });

  return { ok: true };
}

export type RevokeSessionResult = { ok: true } | { ok: false; error: string };

/**
 * Revokes one of the CURRENT user's own Clerk sessions. Never trusts the
 * sessionId alone - a client could pass any string, so this first confirms
 * the session actually belongs to clerkUserId (via Clerk's own session
 * list, the same server-resolved identity getDashboardTenant() already
 * established) before calling revokeSession(). Without that check, this
 * would be a cross-account session-revocation IDOR: any signed-in user
 * could log any other user out by guessing/enumerating session ids.
 */
export async function revokeUserSession(input: {
  organizationId: string;
  userId: string;
  clerkUserId: string;
  sessionId: string;
}): Promise<RevokeSessionResult> {
  if (!input.sessionId) return { ok: false, error: 'No session specified.' };

  try {
    const client = await clerkClient();
    const { data } = await client.sessions.getSessionList({ userId: input.clerkUserId, status: 'active' });
    const owned = data.some((session) => session.id === input.sessionId);
    if (!owned) {
      // Deliberately the same generic error as any other failure - never
      // confirm or deny whether a given sessionId exists at all.
      return { ok: false, error: 'That session could not be revoked.' };
    }
    await client.sessions.revokeSession(input.sessionId);
  } catch (error) {
    console.error('[user-settings] Clerk session revoke failed', error);
    return { ok: false, error: 'That session could not be revoked. Please try again.' };
  }

  await writeAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: 'SECURITY_SESSION_REVOKED',
    metadata: { sessionId: input.sessionId },
  });

  return { ok: true };
}
