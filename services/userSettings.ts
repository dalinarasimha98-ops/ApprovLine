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
 * Backend API rather than duplicating identity storage. `role`,
 * `organization` membership, and the self-reported profile fields below
 * (jobTitle/department/phone/location/timezone) are ApprovLine's own, on
 * the User table - there is no Clerk or other existing equivalent for
 * them (verified before adding the migration), so this is new data, not a
 * duplicate store.
 */

export type UserSecurityStatus = {
  passwordEnabled: boolean;
  twoFactorEnabled: boolean;
  totpEnabled: boolean;
  backupCodeEnabled: boolean;
  lastSignInAt: Date | null;
  /** Real Clerk account-standing flags - used for the Profile card's status
   *  badge ("Active"/"Locked"/"Suspended") instead of an always-"Active"
   *  fabrication. */
  banned: boolean;
  locked: boolean;
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
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  location: string | null;
  timezone: string | null;
  /** Name of this user's manager, if the relationship has ever been set.
   *  No admin UI sets managerId yet, so this is null for every user today -
   *  a real, correctly-modeled relationship rendered honestly as "Not set"
   *  rather than a fabricated manager. */
  managerName: string | null;
  /** The organization's own configured department list (Organization.departments) -
   *  the same list Users & Teams already treats as authoritative - so the
   *  Edit Profile department picker only ever offers real options. */
  organizationDepartments: string[];
};

export type UserNotificationSettings = {
  emailEnabled: boolean;
};

export type SecurityActivityEvent = {
  id: string;
  action: string;
  createdAt: Date;
};

export type UserSettingsData = {
  profile: UserSettingsProfile;
  security: { status: UserSecurityStatus | null; error: string | null };
  sessions: { list: UserSession[]; error: string | null };
  connectedSources: { list: ConnectedSource[]; error: string | null };
  notifications: { settings: UserNotificationSettings; error: string | null };
  /** This user's own recent security/profile-relevant audit events (real
   *  AuditLog rows, filtered to actorUserId - not a separate activity log). */
  securityActivity: { list: SecurityActivityEvent[]; error: string | null };
};

const SECURITY_ACTIVITY_ACTIONS = ['PROFILE_UPDATED', 'SECURITY_SESSION_REVOKED', 'NOTIFICATION_PREFERENCES_UPDATED'];

function toSecurityStatus(clerkUser: ClerkUser): UserSecurityStatus {
  return {
    passwordEnabled: clerkUser.passwordEnabled,
    twoFactorEnabled: clerkUser.twoFactorEnabled,
    totpEnabled: clerkUser.totpEnabled,
    backupCodeEnabled: clerkUser.backupCodeEnabled,
    lastSignInAt: clerkUser.lastSignInAt ? new Date(clerkUser.lastSignInAt) : null,
    banned: clerkUser.banned,
    locked: clerkUser.locked,
  };
}

/**
 * Fetches everything the User Settings page renders in one pass. Each
 * section (security status, sessions, connected sources, notifications)
 * fails independently - a Clerk API hiccup on the sessions list must never
 * take down the rest of an otherwise-working settings page, matching the
 * section-level degrade pattern already used by app/evidence/[id]/page.tsx
 * and the dashboard's approval list.
 */
export async function getUserSettingsData(input: {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationDepartments: string[];
  userId: string;
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

  let profileFields: { jobTitle: string | null; department: string | null; phone: string | null; location: string | null; timezone: string | null; managerName: string | null } = {
    jobTitle: null,
    department: null,
    phone: null,
    location: null,
    timezone: null,
    managerName: null,
  };
  let notifications: UserSettingsData['notifications'];
  try {
    const [dbUser, notificationPreference] = await Promise.all([
      prisma.user.findUnique({
        where: { id: input.userId, organizationId: input.organizationId },
        select: { jobTitle: true, department: true, phone: true, location: true, timezone: true, manager: { select: { name: true, email: true } } },
      }),
      prisma.userNotificationPreference.findUnique({ where: { userId: input.userId }, select: { emailEnabled: true } }),
    ]);
    if (dbUser) {
      profileFields = {
        jobTitle: dbUser.jobTitle,
        department: dbUser.department,
        phone: dbUser.phone,
        location: dbUser.location,
        timezone: dbUser.timezone,
        managerName: dbUser.manager?.name ?? dbUser.manager?.email ?? null,
      };
    }
    // No row means the user has never changed the default - true unless
    // they explicitly opted out, matching the migration's own column default.
    notifications = { settings: { emailEnabled: notificationPreference?.emailEnabled ?? true }, error: null };
  } catch (error) {
    console.error('[user-settings] profile field / notification preference query failed', error);
    notifications = { settings: { emailEnabled: true }, error: 'Your notification preferences could not be loaded right now.' };
  }

  const profile: UserSettingsProfile = {
    name: input.name,
    email: clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress ?? '',
    imageUrl: clerkUser?.imageUrl ?? '',
    role: input.role,
    memberSince: input.createdAt,
    organizationName: input.organizationName,
    organizationSlug: input.organizationSlug,
    organizationDepartments: input.organizationDepartments,
    ...profileFields,
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

  let securityActivity: UserSettingsData['securityActivity'];
  try {
    const rows = await prisma.auditLog.findMany({
      where: { organizationId: input.organizationId, actorUserId: input.userId, action: { in: SECURITY_ACTIVITY_ACTIONS } },
      select: { id: true, action: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    securityActivity = { list: rows, error: null };
  } catch (error) {
    console.error('[user-settings] security activity query failed', error);
    securityActivity = { list: [], error: 'Recent security activity could not be loaded right now.' };
  }

  return { profile, security, sessions, connectedSources, notifications, securityActivity };
}

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

const MAX_TEXT_FIELD_LENGTH = 200;

/** Real, current IANA timezone identifiers - never a hand-maintained, and
 *  possibly stale, fixed list. */
export function supportedTimezones(): string[] {
  return Intl.supportedValuesOf('timeZone');
}

function cleanOptionalText(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Full name is Clerk-owned identity data - updated through the Clerk
 * Backend API (the "correct Clerk update mechanism"), then mirrored into
 * ApprovLine's own User.name so every other page that reads the DB copy
 * (not Clerk directly) sees the change immediately, and the cached tenant
 * record (lib/auth.ts's getDashboardTenant) is invalidated so the very
 * next page load reflects it rather than waiting out its revalidate window.
 *
 * jobTitle/phone/location/timezone/department are self-reported fields
 * that live only on ApprovLine's own User row - no Clerk mechanism to
 * defer to. department is checked against the organization's own real
 * `departments` list (never free text) and timezone against
 * Intl.supportedValuesOf('timeZone') (never a fabricated fixed list), so
 * neither field can be saved as a value that doesn't actually exist.
 */
export async function updateProfile(input: {
  organizationId: string;
  userId: string;
  clerkUserId: string;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  location: string | null;
  timezone: string | null;
  organizationDepartments: string[];
}): Promise<UpdateProfileResult> {
  const trimmedName = input.fullName.trim();
  if (!trimmedName) return { ok: false, error: 'Enter your name.' };
  if (trimmedName.length > MAX_TEXT_FIELD_LENGTH) return { ok: false, error: 'Name is too long.' };

  for (const [label, value] of [['Job title', input.jobTitle], ['Phone', input.phone], ['Location', input.location]] as const) {
    if (value && value.length > MAX_TEXT_FIELD_LENGTH) return { ok: false, error: `${label} is too long.` };
  }
  if (input.department && !input.organizationDepartments.includes(input.department)) {
    return { ok: false, error: 'Choose a department your organization has configured.' };
  }
  if (input.timezone && !supportedTimezones().includes(input.timezone)) {
    return { ok: false, error: 'Choose a valid time zone.' };
  }

  const [firstName, ...rest] = trimmedName.split(/\s+/);
  const lastName = rest.join(' ') || undefined;

  try {
    const client = await clerkClient();
    await client.users.updateUser(input.clerkUserId, { firstName, lastName });
  } catch (error) {
    console.error('[user-settings] Clerk name update failed', error);
    return { ok: false, error: 'Your name could not be updated right now. Please try again.' };
  }

  await prisma.user.update({
    where: { id: input.userId, organizationId: input.organizationId },
    data: {
      name: trimmedName,
      jobTitle: input.jobTitle,
      department: input.department,
      phone: input.phone,
      location: input.location,
      timezone: input.timezone,
    },
  });
  revalidateTag(DASHBOARD_TENANT_CACHE_TAG);
  await writeAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: 'PROFILE_UPDATED',
    metadata: { fields: ['name', 'jobTitle', 'department', 'phone', 'location', 'timezone'] },
  });

  return { ok: true };
}

/** Parses the Edit Profile form's optional text fields consistently -
 *  shared by the page's server action so validation/trimming happens once. */
export function parseProfileFormFields(formData: FormData) {
  return {
    fullName: String(formData.get('fullName') ?? ''),
    jobTitle: cleanOptionalText(formData.get('jobTitle')),
    department: cleanOptionalText(formData.get('department')),
    phone: cleanOptionalText(formData.get('phone')),
    location: cleanOptionalText(formData.get('location')),
    timezone: cleanOptionalText(formData.get('timezone')),
  };
}

export type UpdateNotificationPreferenceResult = { ok: true } | { ok: false; error: string };

/**
 * Persists the ONLY real, optional notification preference this app
 * currently supports: whether to also receive an email when this user (by
 * matching email) is asked to confirm a manual approval recorded on their
 * behalf. See shouldSendOptionalConfirmationEmail() below and
 * app/api/approvals/[id]/confirmations/route.ts for how this is enforced -
 * disabling it never removes the ApprovalConfirmationRequest record, the
 * audit trail, or the requirement to act on it.
 */
export async function updateNotificationPreference(input: {
  organizationId: string;
  userId: string;
  emailEnabled: boolean;
}): Promise<UpdateNotificationPreferenceResult> {
  try {
    await prisma.userNotificationPreference.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, emailEnabled: input.emailEnabled },
      update: { emailEnabled: input.emailEnabled },
    });
  } catch (error) {
    console.error('[user-settings] notification preference update failed', error);
    return { ok: false, error: 'Your notification preference could not be saved right now.' };
  }

  await writeAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: 'NOTIFICATION_PREFERENCES_UPDATED',
    metadata: { emailEnabled: input.emailEnabled },
  });

  return { ok: true };
}

/**
 * Whether the optional confirmation-request email should be sent to a given
 * approver address within an organization. Returns true (send it) whenever
 * the address doesn't match any registered ApprovLine user in that org -
 * an external/verbal approver has no preference to check, so the email
 * behaves exactly as it always has for them. Only when the address belongs
 * to a real user in this org does their own emailEnabled preference apply.
 *
 * This is the ONLY thing the preference is allowed to affect - it is never
 * consulted anywhere that would skip creating the ApprovalConfirmationRequest
 * record itself, its audit log entry, or the confirmation link.
 */
export async function shouldSendOptionalConfirmationEmail(organizationId: string, approverEmail: string): Promise<boolean> {
  try {
    const user = await prisma.user.findFirst({
      where: { organizationId, email: { equals: approverEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!user) return true;
    const preference = await prisma.userNotificationPreference.findUnique({ where: { userId: user.id }, select: { emailEnabled: true } });
    return preference?.emailEnabled ?? true;
  } catch (error) {
    console.error('[user-settings] confirmation email preference lookup failed, defaulting to sending it', error);
    // Fail open toward the existing, always-on behavior - a preference
    // lookup outage must never silently suppress a compliance-relevant
    // confirmation email that would otherwise have been sent.
    return true;
  }
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
