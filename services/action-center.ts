/**
 * Action Center (/dashboard/pending-actions) — the customer-facing "what
 * requires my attention" inbox. See lib/action-center.ts's header for the
 * full architecture note on how a "pending action" is derived and
 * resolved. This file owns every Prisma query; no business logic lives in
 * the page or client component.
 *
 * ONE base query drives the entire feature: ApprovalRecord rows that are
 * either still PENDING_REVIEW (the classifier's own "not yet decided"
 * status) or whose linked ManualApprovalDetail is still
 * PENDING_CONFIRMATION. Every ApprovalConfirmationRequest row is
 * guaranteed to have a ManualApprovalDetail parent (verified by reading
 * app/api/approvals/[id]/confirmations/route.ts, which 404s without one),
 * so there is no third, independent source to union in — no
 * second/duplicate approval, evidence, or correlation engine was created.
 *
 * TENANT ISOLATION: every query below starts from `organizationId:
 * filters.organizationId`, taken from the server-resolved tenant (see
 * app/dashboard/pending-actions/page.tsx), never from a client-supplied
 * value. getActionById() re-checks organizationId on every lookup so an
 * action ID from another tenant 404s instead of leaking existence.
 *
 * RBAC/VISIBILITY: OWNER/ADMIN/MANAGER get organization-wide visibility
 * (the same tier already granted broader visibility elsewhere, e.g.
 * /dashboard/alerts). MEMBER/AUDITOR/VIEWER only ever see actions actually
 * assigned to them — resolved via a real identity match (their own User.id
 * against approverUserId/secondVerifierUserId, or their own email,
 * case-insensitively, against approverEmail/confirmationRequest.
 * approverEmail) — never a name-similarity guess. An action nobody can be
 * matched to is surfaced only to the org-wide tier as "Unassigned", never
 * silently assigned to the wrong person.
 */

import type { Prisma, Role, ManualApprovalVerificationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { getSafeEvidenceUrl } from '@/lib/evidence-links';
import { getUnifiedEvidenceIdsForApprovals } from '@/services/evidence/records';
import {
  type ActionType,
  type ActionPriority,
  type ActionStatus,
  type ClosedActionStatus,
  normalizePriority,
  resolveActionStatus,
} from '@/lib/action-center';

const QUERY_TIMEOUT_MS = 5000;
const PAGE_SIZE = 10;
const RECENTLY_RESOLVED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Roles with the same organization-wide operational visibility already
// granted to /dashboard/alerts (see lib/rbac.ts's ROUTE_PERMISSIONS for
// that precedent) — everyone else sees only actions assigned to them.
const ORG_WIDE_VISIBILITY_ROLES: Role[] = ['OWNER', 'ADMIN', 'MANAGER'];

export type ActionCenterViewer = {
  organizationId: string;
  userId: string;
  email: string;
  role: Role;
};

function hasOrgWideVisibility(role: Role): boolean {
  return ORG_WIDE_VISIBILITY_ROLES.includes(role);
}

/** The real identity-match OR-clause used both to scope the personal
 *  inbox and (for the resolved-history query) to keep base roles from
 *  ever seeing another user's history. Never matched on name alone.
 *  Exported for services/individualDashboard.ts, which needs this exact
 *  predicate to scope its own, smaller queries (the personal approvals
 *  list, etc.) to the viewer - reusing the one proven identity match
 *  rather than re-deriving a second, possibly-diverging definition of
 *  "my approvals." */
export function viewerIdentityWhere(viewer: ActionCenterViewer): Prisma.ApprovalRecordWhereInput {
  const email = viewer.email.toLowerCase();
  return {
    OR: [
      { approverUserId: viewer.userId },
      { approverEmail: { equals: email, mode: 'insensitive' } },
      { manualDetail: { is: { secondVerifierUserId: viewer.userId } } },
      { confirmationRequests: { some: { approverEmail: { equals: email, mode: 'insensitive' } } } },
    ],
  };
}

/** Exported alongside viewerIdentityWhere for the same reason - the
 *  individual dashboard's "My Approvals" list needs the identical
 *  open-action definition Action Center itself uses, not a second one. */
export function openActionWhere(): Prisma.ApprovalRecordWhereInput {
  return {
    OR: [
      { status: 'PENDING_REVIEW' },
      { manualDetail: { is: { verificationStatus: 'PENDING_CONFIRMATION' } } },
    ],
  };
}

export type ActionCenterFilters = {
  q?: string;
  source?: string; // ActionSourcePlatform, uppercase
  actionType?: ActionType;
  priority?: ActionPriority;
  status?: 'OPEN' | 'RESOLVED';
  page?: number;
};

function buildWhere(viewer: ActionCenterViewer, filters: ActionCenterFilters): Prisma.ApprovalRecordWhereInput {
  const scope = hasOrgWideVisibility(viewer.role) ? {} : viewerIdentityWhere(viewer);
  const statusClause: Prisma.ApprovalRecordWhereInput =
    filters.status === 'RESOLVED'
      ? { manualDetail: { is: { verificationStatus: { in: ['CONFIRMED_BY_APPROVER', 'DISPUTED', 'SUPERSEDED'] } } } }
      : openActionWhere();

  const q = filters.q?.trim();
  const searchClause: Prisma.ApprovalRecordWhereInput | undefined = q
    ? {
        OR: [
          { subject: { contains: q, mode: 'insensitive' } },
          { approverName: { contains: q, mode: 'insensitive' } },
          { approverEmail: { contains: q, mode: 'insensitive' } },
          { department: { contains: q, mode: 'insensitive' } },
          { category: { contains: q, mode: 'insensitive' } },
          { sourcePlatform: { contains: q, mode: 'insensitive' } },
          { messageSource: { is: { sender: { contains: q, mode: 'insensitive' } } } },
          { messageSource: { is: { senderEmail: { contains: q, mode: 'insensitive' } } } },
        ],
      }
    : undefined;

  const sourceClause: Prisma.ApprovalRecordWhereInput | undefined = filters.source
    ? { sourcePlatform: { contains: filters.source, mode: 'insensitive' } }
    : undefined;

  const actionTypeClause: Prisma.ApprovalRecordWhereInput | undefined = (() => {
    if (!filters.actionType) return undefined;
    if (filters.actionType === 'CONFIRMATION_REQUEST') return { manualDetail: { is: { verificationStatus: 'PENDING_CONFIRMATION' } } };
    if (filters.actionType === 'REVIEW_REQUEST') return { status: 'PENDING_REVIEW', approvalType: 'ESCALATION' };
    return { status: 'PENDING_REVIEW', approvalType: { not: 'ESCALATION' } };
  })();

  const priorityClause: Prisma.ApprovalRecordWhereInput | undefined = filters.priority
    ? filters.priority === 'low'
      ? { OR: [{ riskLevel: null }, { riskLevel: { equals: 'low', mode: 'insensitive' } }] }
      : { riskLevel: { equals: filters.priority, mode: 'insensitive' } }
    : undefined;

  return {
    organizationId: viewer.organizationId,
    ...scope,
    AND: [statusClause, searchClause, sourceClause, actionTypeClause, priorityClause].filter(
      (clause): clause is Prisma.ApprovalRecordWhereInput => Boolean(clause),
    ),
  };
}

const actionRecordSelect = {
  id: true,
  subject: true,
  reasoning: true,
  conditions: true,
  businessImpact: true,
  evidenceSnippet: true,
  approverName: true,
  approverEmail: true,
  approverUserId: true,
  department: true,
  category: true,
  riskLevel: true,
  sourcePlatform: true,
  sourceLink: true,
  approvalType: true,
  status: true,
  occurredAt: true,
  createdAt: true,
  approverUser: { select: { id: true, name: true, email: true } },
  messageSource: { select: { sender: true, senderEmail: true, channel: true, provider: true } },
  manualDetail: {
    select: {
      verificationStatus: true,
      recorderUserId: true,
      recorder: { select: { id: true, name: true, email: true } },
      secondPersonRequired: true,
      secondVerifierUserId: true,
      secondVerifiedAt: true,
      secondVerifier: { select: { id: true, name: true, email: true } },
      businessContext: true,
      communicationChannel: true,
      updatedAt: true,
    },
  },
  confirmationRequests: {
    where: { decision: 'PENDING' },
    orderBy: { expiresAt: 'asc' as const },
    take: 1,
    select: { id: true, expiresAt: true, approverEmail: true, approverName: true, requestedByUserId: true },
  },
} satisfies Prisma.ApprovalRecordSelect;

type ActionRecord = Prisma.ApprovalRecordGetPayload<{ select: typeof actionRecordSelect }>;

export type ActionRow = {
  id: string;
  actionType: ActionType;
  title: string;
  context: string | null;
  requestedByName: string | null;
  requestedByEmail: string | null;
  requestedForUserId: string | null;
  requestedForName: string | null;
  requestedForEmail: string | null;
  sourcePlatformRaw: string | null;
  sourceChannel: string | null;
  category: string | null;
  department: string | null;
  priority: ActionPriority;
  requestedAt: Date;
  dueAt: Date | null;
  status: ActionStatus;
  evidenceRecordId: string | null;
  confirmationRequestId: string | null;
  sourceExternalUrl: string | null;
};

function deriveActionType(r: ActionRecord): ActionType {
  if (r.manualDetail?.verificationStatus === 'PENDING_CONFIRMATION') return 'CONFIRMATION_REQUEST';
  return r.approvalType === 'ESCALATION' ? 'REVIEW_REQUEST' : 'APPROVAL_REQUEST';
}

function deriveClosedAs(status: ManualApprovalVerificationStatus | undefined): ClosedActionStatus | null {
  if (status === 'CONFIRMED_BY_APPROVER') return 'RESOLVED';
  if (status === 'DISPUTED') return 'DISPUTED';
  if (status === 'SUPERSEDED') return 'SUPERSEDED';
  return null;
}

function toActionRow(r: ActionRecord, now: Date): ActionRow {
  const actionType = deriveActionType(r);
  const pendingConfirmation = r.confirmationRequests[0] ?? null;
  const dueAt = pendingConfirmation?.expiresAt ?? null;
  const closedAs = actionType === 'CONFIRMATION_REQUEST' ? deriveClosedAs(r.manualDetail?.verificationStatus) : deriveClosedAs(undefined);

  // Requested-for resolution — strongest signal first, never a name guess.
  let requestedForUserId: string | null = null;
  let requestedForName: string | null = null;
  let requestedForEmail: string | null = null;
  const needsSecondVerifier = Boolean(r.manualDetail?.secondPersonRequired && !r.manualDetail.secondVerifiedAt && r.manualDetail.secondVerifierUserId);
  if (needsSecondVerifier && r.manualDetail?.secondVerifier) {
    requestedForUserId = r.manualDetail.secondVerifier.id;
    requestedForName = r.manualDetail.secondVerifier.name;
    requestedForEmail = r.manualDetail.secondVerifier.email;
  } else if (r.approverUser) {
    requestedForUserId = r.approverUser.id;
    requestedForName = r.approverUser.name;
    requestedForEmail = r.approverUser.email;
  } else {
    requestedForEmail = pendingConfirmation?.approverEmail ?? r.approverEmail ?? null;
    requestedForName = r.approverName ?? pendingConfirmation?.approverName ?? null;
    // requestedForUserId stays null (unresolved by exact ID) — a bulk
    // email match against org Users happens one level up in
    // resolveUnmatchedRecipients() for the current page only, never per row.
  }

  const requestedByName = r.manualDetail?.recorder?.name ?? r.messageSource?.sender ?? null;
  const requestedByEmail = r.manualDetail?.recorder?.email ?? r.messageSource?.senderEmail ?? null;

  return {
    id: r.id,
    actionType,
    title: r.subject,
    context: r.reasoning || r.manualDetail?.businessContext || r.evidenceSnippet || null,
    requestedByName,
    requestedByEmail,
    requestedForUserId,
    requestedForName,
    requestedForEmail,
    sourcePlatformRaw: r.sourcePlatform ?? r.messageSource?.provider ?? null,
    sourceChannel: r.messageSource?.channel ?? r.manualDetail?.communicationChannel ?? null,
    category: r.category,
    department: r.department,
    priority: normalizePriority(r.riskLevel),
    requestedAt: r.occurredAt ?? r.createdAt,
    dueAt,
    status: resolveActionStatus({ closedAs, dueAt }, now),
    evidenceRecordId: null, // filled in batch below
    confirmationRequestId: pendingConfirmation?.id ?? null,
    sourceExternalUrl: getSafeEvidenceUrl(r.sourceLink),
  };
}

/** Bulk-resolves rows whose requestedForUserId is still null (no direct FK
 *  match) against a real exact-email match within the org — one query for
 *  the whole page, never per row. Rows that still don't match anyone stay
 *  genuinely unassigned rather than guessed. */
async function resolveUnmatchedRecipients(organizationId: string, rows: ActionRow[]): Promise<void> {
  const unresolvedEmails = [...new Set(rows.filter((r) => !r.requestedForUserId && r.requestedForEmail).map((r) => r.requestedForEmail!.toLowerCase()))];
  if (unresolvedEmails.length === 0) return;
  const users = await prisma.user.findMany({
    where: { organizationId, email: { in: unresolvedEmails, mode: 'insensitive' } },
    select: { id: true, name: true, email: true },
  });
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  for (const row of rows) {
    if (row.requestedForUserId || !row.requestedForEmail) continue;
    const match = byEmail.get(row.requestedForEmail.toLowerCase());
    if (match) {
      row.requestedForUserId = match.id;
      row.requestedForName = match.name ?? row.requestedForName;
    }
  }
}

export type ActionCenterKpis = {
  needsAttention: number;
  dueToday: number;
  overdue: number;
  highPriority: number;
  recentlyResolved: number;
};

/**
 * `forcePersonalScope` (default false, preserving this Action Center page's
 * own existing org-wide-for-OWNER/ADMIN/MANAGER behavior exactly) lets
 * services/individualDashboard.ts get these same, real KPI numbers always
 * scoped to the viewer's own identity regardless of role - an Owner still
 * has personal approvals assigned to them that their individual dashboard
 * must show as "mine," even though Action Center itself intentionally
 * gives that role org-wide visibility on its own page. This is the only
 * change to this function; the numbers/queries themselves are untouched.
 */
export async function computeKpis(viewer: ActionCenterViewer, forcePersonalScope = false): Promise<ActionCenterKpis> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);
  const scope = forcePersonalScope || !hasOrgWideVisibility(viewer.role) ? viewerIdentityWhere(viewer) : {};
  // Real bug fixed here: scope and openActionWhere() each return a
  // top-level `OR` clause. Spreading both of them directly into the same
  // object literal let the second spread silently overwrite the first
  // one's `OR` key, so every KPI below silently ignored the viewer-identity
  // restriction for every non-org-wide role
  // (MEMBER/AUDITOR/VIEWER) and counted org-wide instead - discovered by
  // running this function directly against seeded data for a VIEWER with
  // no matching approverEmail/approverUserId and seeing needsAttention
  // return the full org count while the row-level query (buildWhere(),
  // which already combines the two via AND instead of spreading) correctly
  // returned zero rows. Nesting openActionWhere() inside AND matches
  // buildWhere()'s already-correct pattern below.
  const openWhere: Prisma.ApprovalRecordWhereInput = { organizationId: viewer.organizationId, ...scope, AND: [openActionWhere()] };

  const [needsAttention, dueToday, overdue, highPriority, recentlyResolved] = await withTimeout(
    'action-center:kpis',
    Promise.all([
      prisma.approvalRecord.count({ where: openWhere }),
      prisma.approvalRecord.count({ where: { ...openWhere, confirmationRequests: { some: { decision: 'PENDING', expiresAt: { gte: startOfToday, lt: startOfTomorrow } } } } }),
      prisma.approvalRecord.count({ where: { ...openWhere, confirmationRequests: { some: { decision: 'PENDING', expiresAt: { lt: now } } } } }),
      prisma.approvalRecord.count({ where: { ...openWhere, riskLevel: { in: ['high', 'critical', 'High', 'Critical', 'HIGH', 'CRITICAL'] } } }),
      prisma.manualApprovalDetail.count({
        where: {
          organizationId: viewer.organizationId,
          verificationStatus: { in: ['CONFIRMED_BY_APPROVER', 'DISPUTED'] },
          updatedAt: { gte: new Date(now.getTime() - RECENTLY_RESOLVED_WINDOW_MS) },
          ...(forcePersonalScope || !hasOrgWideVisibility(viewer.role) ? { approvalRecord: { is: viewerIdentityWhere(viewer) } } : {}),
        },
      }),
    ]),
    QUERY_TIMEOUT_MS,
  );

  return { needsAttention, dueToday, overdue, highPriority, recentlyResolved };
}

export type ActionCenterResult = {
  rows: ActionRow[];
  kpis: ActionCenterKpis;
  page: number;
  totalPages: number;
  totalCount: number;
};

export async function loadActionCenter(viewer: ActionCenterViewer, filters: ActionCenterFilters): Promise<ActionCenterResult> {
  const page = Math.max(1, filters.page ?? 1);
  const where = buildWhere(viewer, filters);
  const now = new Date();

  const [totalCount, records, kpis] = await withTimeout(
    'action-center:load',
    Promise.all([
      prisma.approvalRecord.count({ where }),
      prisma.approvalRecord.findMany({
        where,
        select: actionRecordSelect,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      computeKpis(viewer),
    ]),
    QUERY_TIMEOUT_MS,
  );

  const rows = records.map((r) => toActionRow(r, now));
  await resolveUnmatchedRecipients(viewer.organizationId, rows);

  const evidenceIds = await getUnifiedEvidenceIdsForApprovals(viewer.organizationId, rows.map((r) => r.id));
  for (const row of rows) row.evidenceRecordId = evidenceIds.get(row.id) ?? null;

  return {
    rows,
    kpis,
    page,
    totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    totalCount,
  };
}

export type ActionDetail = ActionRow & {
  approvalRecordId: string;
  fullContext: string | null;
  hasApprovalRecord: boolean;
};

/** Tenant-safe single-action lookup for the detail drawer's deep-link
 *  targets. Returns null (never throws a distinguishable error) for a
 *  wrong-tenant ID — the caller renders the same "not found" state as a
 *  genuinely missing ID, so a cross-tenant probe learns nothing. */
export async function getActionById(viewer: ActionCenterViewer, id: string): Promise<ActionDetail | null> {
  const record = await withTimeout(
    'action-center:getById',
    prisma.approvalRecord.findFirst({
      where: {
        id,
        organizationId: viewer.organizationId,
        ...(hasOrgWideVisibility(viewer.role) ? {} : viewerIdentityWhere(viewer)),
      },
      select: actionRecordSelect,
    }),
    QUERY_TIMEOUT_MS,
  );
  if (!record) return null;

  const now = new Date();
  const row = toActionRow(record, now);
  await resolveUnmatchedRecipients(viewer.organizationId, [row]);
  const evidenceIds = await getUnifiedEvidenceIdsForApprovals(viewer.organizationId, [row.id]);
  row.evidenceRecordId = evidenceIds.get(row.id) ?? null;

  return {
    ...row,
    approvalRecordId: record.id,
    fullContext: record.reasoning || record.manualDetail?.businessContext || null,
    hasApprovalRecord: true,
  };
}
