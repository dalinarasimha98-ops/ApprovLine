import { prisma } from '@/lib/prisma';
import { ROLE_HIERARCHY, hasAnyRole, type Role } from '@/lib/rbac';
import { writeAuditLog } from '@/services/audit';

export class TeamRoleChangeError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'TeamRoleChangeError';
  }
}

/**
 * Changes a teammate's role within the same organization. Every guard here
 * exists to close a specific privilege-escalation path:
 *
 * - Only OWNER/ADMIN may call this at all.
 * - The caller can never assign a role above their own hierarchy tier - this
 *   is what stops an ADMIN from minting a new OWNER, and (since a caller
 *   changing their own role is just the target === actor case) stops anyone
 *   from self-escalating past whatever role they already hold.
 * - The organization's last OWNER can never be demoted, by themselves or by
 *   another OWNER/ADMIN, since that would permanently lock everyone out of
 *   OWNER-only actions (including undoing the demotion).
 */
export async function updateMemberRole(params: {
  organizationId: string;
  actorUserId: string;
  actorRole: Role;
  targetUserId: string;
  newRole: Role;
}) {
  const { organizationId, actorUserId, actorRole, targetUserId, newRole } = params;

  if (!hasAnyRole(actorRole, ['OWNER', 'ADMIN'])) {
    throw new TeamRoleChangeError('Only workspace owners and admins can change member roles.', 403);
  }

  if (ROLE_HIERARCHY[newRole] > ROLE_HIERARCHY[actorRole]) {
    throw new TeamRoleChangeError('You cannot assign a role higher than your own.', 403);
  }

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, organizationId },
  });
  if (!target) {
    throw new TeamRoleChangeError('Team member not found in this workspace.', 404);
  }

  if (target.role === 'OWNER' && newRole !== 'OWNER') {
    const ownerCount = await prisma.user.count({ where: { organizationId, role: 'OWNER' } });
    if (ownerCount <= 1) {
      throw new TeamRoleChangeError('This workspace must always have at least one OWNER - promote another member to OWNER first.', 409);
    }
  }

  if (target.role === newRole) {
    return target;
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { role: newRole },
  });

  await writeAuditLog({
    organizationId,
    actorUserId,
    action: 'team.member.role_changed',
    metadata: {
      targetUserId: target.id,
      targetEmail: target.email,
      previousRole: target.role,
      newRole,
    },
  });

  return updated;
}
