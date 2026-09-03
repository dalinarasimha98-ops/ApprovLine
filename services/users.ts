import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { tenantScopedWhere } from '@/lib/tenant-isolation';
import { toDate } from '@/lib/types/dates';
import type { Role } from '@/lib/rbac';

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  teams: { id: string; name: string }[];
  createdAt: Date;
};

export type TeamRow = {
  id: string;
  name: string;
  department: string | null;
  memberCount: number;
  members: { id: string; name: string | null; email: string; role: Role }[];
  createdAt: Date;
};

export type PendingInvite = {
  email: string;
  name: string;
  role: string;
  invitedAt?: string;
  invitedByName?: string;
};

export type ActivityEvent = {
  id: string;
  action: string;
  actorName: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export type UsersTeamsSummary = {
  totalUsers: number;
  totalTeams: number;
  pendingInvites: number;
  roleDistribution: Record<string, number>;
};

export type UsersTeamsData = {
  users: UserRow[];
  teams: TeamRow[];
  pendingInvites: PendingInvite[];
  recentActivity: ActivityEvent[];
  summary: UsersTeamsSummary;
};

function jsonArray<T>(val: unknown): T[] {
  if (!val) return [];
  try {
    const parsed = typeof val === 'string' ? JSON.parse(val) : val;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function fetchUsersTeamsData(organizationId: string): Promise<UsersTeamsData> {
  const scope = { organizationId };

  const [users, teams, org, recentLogs] = await Promise.all([
    prisma.user.findMany({
      where: tenantScopedWhere(scope),
      include: {
        teams: {
          include: { team: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.team.findMany({
      where: tenantScopedWhere(scope),
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { invitedTeamMembers: true },
    }),
    prisma.auditLog.findMany({
      where: {
        ...tenantScopedWhere(scope),
        action: { in: [
          'team.member.role_changed',
          'team.member.added',
          'team.member.removed',
          'team.created',
          'team.updated',
          'team.deleted',
          'user.invited',
          'user.deactivated',
          'security_request_submitted',
        ]},
      },
      include: {
        actorUser: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const userRows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as Role,
    teams: u.teams.map((tm) => ({ id: tm.team.id, name: tm.team.name })),
    createdAt: toDate(u.createdAt),
  }));

  const teamRows: TeamRow[] = teams.map((t) => ({
    id: t.id,
    name: t.name,
    department: t.department,
    memberCount: t.members.length,
    members: t.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.user.role as Role,
    })),
    createdAt: toDate(t.createdAt),
  }));

  const pendingInvites = jsonArray<PendingInvite>(org?.invitedTeamMembers);

  const actorIndex = new Map(users.map((u) => [u.id, u.name ?? u.email]));

  const recentActivity: ActivityEvent[] = recentLogs.map((log) => {
    const actorName =
      log.actorUser?.name ?? log.actorUser?.email ?? (log.actorUserId ? actorIndex.get(log.actorUserId) ?? null : null);
    return {
      id: log.id,
      action: log.action,
      actorName,
      metadata: (log.metadata as Record<string, unknown>) ?? {},
      createdAt: toDate(log.createdAt),
    };
  });

  const roleDistribution: Record<string, number> = {};
  for (const u of users) {
    roleDistribution[u.role] = (roleDistribution[u.role] ?? 0) + 1;
  }

  return {
    users: userRows,
    teams: teamRows,
    pendingInvites,
    recentActivity,
    summary: {
      totalUsers: users.length,
      totalTeams: teams.length,
      pendingInvites: pendingInvites.length,
      roleDistribution,
    },
  };
}

export const getUsersTeamsData = cache(
  unstable_cache(
    async (organizationId: string) => fetchUsersTeamsData(organizationId),
    ['users-teams-data'],
    { revalidate: 30, tags: ['users-teams'] },
  ),
);

export function usersTeamsCacheTag(organizationId: string) {
  return `users-teams-${organizationId}`;
}
