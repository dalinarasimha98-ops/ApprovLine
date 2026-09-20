import { redirect } from 'next/navigation';
import { getDashboardTenant } from '@/lib/auth';
import { ActionCenterClient } from '@/components/dashboard/ActionCenterClient';
import { loadActionCenter, getActionById, type ActionCenterViewer } from '@/services/action-center';
import type { ActionType, ActionPriority } from '@/lib/action-center';

export const dynamic = 'force-dynamic';

const VALID_ACTION_TYPES: ActionType[] = ['APPROVAL_REQUEST', 'REVIEW_REQUEST', 'CONFIRMATION_REQUEST'];
const VALID_PRIORITIES: ActionPriority[] = ['low', 'medium', 'high', 'critical'];

export default async function PendingActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string; actionType?: string; priority?: string; status?: string; page?: string; action?: string }>;
}) {
  const tenant = await getDashboardTenant();
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization || !tenant.user) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-amber-200">
        <h1 className="text-lg font-bold">Action Center couldn&apos;t load</h1>
        <p className="mt-2 text-sm">Please try again in a moment.</p>
      </div>
    );
  }

  const sp = await searchParams;
  const q = sp.q ?? '';
  const source = sp.source ?? '';
  const actionType = VALID_ACTION_TYPES.includes(sp.actionType as ActionType) ? (sp.actionType as ActionType) : '';
  const priority = VALID_PRIORITIES.includes(sp.priority as ActionPriority) ? (sp.priority as ActionPriority) : '';
  const status = sp.status === 'RESOLVED' ? 'RESOLVED' : 'OPEN';
  const page = Math.max(1, Number(sp.page ?? '1') || 1);

  const viewer: ActionCenterViewer = {
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
    email: tenant.user.email,
    role: tenant.user.role,
  };

  let result;
  let loadError: string | null = null;
  try {
    result = await loadActionCenter(viewer, {
      q: q || undefined,
      source: source || undefined,
      actionType: actionType || undefined,
      priority: priority || undefined,
      status,
      page,
    });
  } catch (error) {
    console.error('[action-center] load failed', error);
    loadError = error instanceof Error ? error.message : 'Unknown error';
  }

  if (loadError || !result) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-amber-200">
        <h1 className="text-lg font-bold">Action Center couldn&apos;t load</h1>
        <p className="mt-2 text-sm">Please try again. If this keeps happening, contact support.</p>
      </div>
    );
  }

  // A deep-linked action (e.g. from "Copy link") may fall outside the
  // current page/filter window — resolved tenant-safely by ID rather than
  // trusting the URL blindly; returns null (never a distinguishable
  // error) for a wrong-tenant or nonexistent ID.
  const initialSelectedId = sp.action ?? null;
  const alreadyOnPage = initialSelectedId ? result.rows.some((r) => r.id === initialSelectedId) : false;
  const initialSelectedFallback = initialSelectedId && !alreadyOnPage ? await getActionById(viewer, initialSelectedId).catch(() => null) : null;

  return (
    <ActionCenterClient
      rows={result.rows}
      kpis={result.kpis}
      page={result.page}
      totalPages={result.totalPages}
      totalCount={result.totalCount}
      filters={{ q, source, actionType, priority, status }}
      initialSelectedId={initialSelectedId && (alreadyOnPage || initialSelectedFallback) ? initialSelectedId : null}
      initialSelectedFallback={initialSelectedFallback}
      approvalsHref="/dashboard/approvals"
    />
  );
}
