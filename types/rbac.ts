export type AppRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'COMPLIANCE_OFFICER';

export const roleHierarchy: Record<AppRole, number> = {
  EMPLOYEE: 1,
  MANAGER: 2,
  COMPLIANCE_OFFICER: 3,
  ADMIN: 4,
};

export function canAccessRole(userRole: AppRole, requiredRole: AppRole) {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}
