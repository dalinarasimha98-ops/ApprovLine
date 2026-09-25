/**
 * Organization.defaultWorkspaceView - a real, consumed preference. Every
 * option is an existing, real route; app/get-started/page.tsx's post-
 * sign-in redirect uses this exact allowlist rather than always sending
 * onboarded users to /dashboard, so changing the setting has a genuine,
 * observable effect on navigation.
 */
export const WORKSPACE_VIEW_OPTIONS = [
  { value: '/dashboard', label: 'Dashboard' },
  { value: '/dashboard/approvals', label: 'Approvals' },
  { value: '/dashboard/pending-actions', label: 'Action Center' },
  { value: '/evidence', label: 'Evidence' },
] as const;

export type WorkspaceViewValue = (typeof WORKSPACE_VIEW_OPTIONS)[number]['value'];

export function isWorkspaceViewValue(value: unknown): value is WorkspaceViewValue {
  return typeof value === 'string' && WORKSPACE_VIEW_OPTIONS.some((o) => o.value === value);
}
