/**
 * Founder Audit Logs (/founder/audit) — the authoritative governance
 * interface for privileged Founder actions: what happened, who did it,
 * which customer was affected, when, on what resource, and (where the
 * writer recorded it) the previous/new state. Introduces no new audit
 * model and no new audit writer.
 *
 * ARCHITECTURE AUDIT — what already exists, and what this module adds:
 *
 *   - FounderAuditLog (id/customerAccountId?/actorUserId?/actorEmail?/
 *     actorRole?/action/targetType/targetId?/metadata?/createdAt) is the
 *     sole source of truth — already indexed on createdAt, actorEmail,
 *     [customerAccountId, createdAt], and action. No migration is needed:
 *     every field this page displays already exists on this model.
 *   - services/founder.ts's logFounderAction() is the sole, canonical
 *     writer — grepped every real call site across the repository
 *     (services/founder.ts, services/founderDemoGenerator.ts,
 *     app/founder/integrations/actions.ts, app/founder/customer-
 *     integrations/actions.ts) to build the real action inventory this
 *     page's taxonomy (lib/founder-audit-logs.ts) is built from. No
 *     second writer is introduced here; this module is strictly a read
 *     model.
 *   - services/founder.ts's own listFounderAuditLogs()/auditWhere()/
 *     exportFounderAuditLogs() (used by the pre-existing /founder/audit
 *     page and its CSV/JSON export route) are deliberately left
 *     untouched: they have no pagination, no total count, no customer
 *     join, and no category support, so they cannot honestly serve this
 *     page's requirements. Rather than overload that already-shipped,
 *     already-tested reader (which the export route still depends on
 *     exactly as before), this module is a second, purpose-built READ
 *     MODEL over the same table — matching the precedent already set by
 *     services/founder-activity.ts alongside that same original reader.
 *   - services/founder-activity.ts's own taxonomy (lib/founder-activity.ts)
 *     is reused directly for every customer-scoped action; only the 3
 *     genuinely platform-wide actions it deliberately excludes are added
 *     here, additively (see lib/founder-audit-logs.ts's header).
 *   - The customer relation is resolved via a single Prisma `include` on
 *     the one paginated query (a real SQL join, not a query per row) —
 *     never a client-supplied organizationId/customerAccountId, and never
 *     inferred from metadata or targetId alone.
 *   - Metadata is never searched directly (a raw metadata contains-search
 *     could surface a secret-shaped value in a search-hit context before
 *     the display-time sanitizer runs) — search only touches action,
 *     actorEmail, targetType, and the joined customer's companyName/domain,
 *     all via Prisma's parameterized query builder (no raw SQL, no string
 *     interpolation).
 */
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import {
  auditCategoryFor,
  auditActionsInCategory,
  isKnownAuditDateRange,
  auditDateRangeCutoff,
  KNOWN_AUDIT_ACTIONS,
  type AuditCategory,
} from '@/lib/founder-audit-logs';

const PAGE_SIZE = 25;

export type AuditLogRow = {
  id: string;
  createdAt: Date;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  customer: { id: string; companyName: string; domain: string } | null;
};

export type AuditLogsFilters = {
  q?: string;
  category?: string;
  action?: string;
  customerAccountId?: string;
  range?: string;
  page?: number;
};

export type AuditLogsKpis = {
  totalEvents: number;
  todayEvents: number;
  customersAffected: number;
  administrativeActions: number;
};

export type AuditLogsReport =
  | {
      ok: true;
      migrationRequired: false;
      kpis: AuditLogsKpis;
      rows: AuditLogRow[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      hasAnyEventsAtAll: boolean;
    }
  | { ok: false; migrationRequired: boolean; safeError: string };

function missingFounderStorage(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('does not exist') || message.includes('FounderAuditLog') || message.includes('CustomerAccount');
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgresql:\/\/[^\s]+/g, '[database-url-redacted]').slice(0, 220);
}

/**
 * Validates every filter against a real allow-list before it ever reaches
 * a Prisma query. An unrecognized category/action/range is silently
 * dropped (never thrown, never passed through as a raw string to `where`)
 * — malformed or adversarial query parameters can only ever produce a
 * narrower-or-equal, never-crashing result.
 */
function buildWhere(filters: AuditLogsFilters): Prisma.FounderAuditLogWhereInput {
  const where: Prisma.FounderAuditLogWhereInput = {};

  if (filters.customerAccountId) {
    where.customerAccountId = filters.customerAccountId;
  }

  const category = filters.category as AuditCategory | undefined;
  const validCategory = category && (category === 'PLATFORM' || category in { LIFECYCLE: 1, ADMINISTRATION: 1, COMMERCIAL: 1, INTEGRATIONS: 1, PRODUCT: 1, SUPPORT: 1, OTHER: 1 }) ? category : undefined;
  if (validCategory) {
    where.action = { in: auditActionsInCategory(validCategory) };
  }
  if (filters.action && KNOWN_AUDIT_ACTIONS.has(filters.action)) {
    // A specific action selection narrows further than (or overrides) a
    // coarser category selection — never widens it.
    where.action = filters.action;
  }

  if (isKnownAuditDateRange(filters.range)) {
    const cutoff = auditDateRangeCutoff(filters.range);
    if (cutoff) where.createdAt = { gte: cutoff };
  }

  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { action: { contains: q, mode: 'insensitive' } },
      { actorEmail: { contains: q, mode: 'insensitive' } },
      { targetType: { contains: q, mode: 'insensitive' } },
      { customerAccount: { companyName: { contains: q, mode: 'insensitive' } } },
      { customerAccount: { domain: { contains: q, mode: 'insensitive' } } },
    ];
  }

  return where;
}

export async function buildFounderAuditLogs(filters: AuditLogsFilters = {}): Promise<AuditLogsReport> {
  try {
    const where = buildWhere(filters);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [total, totalEvents, todayEvents, customerGroups, actionGroups] = await Promise.all([
      prisma.founderAuditLog.count({ where }),
      prisma.founderAuditLog.count(),
      prisma.founderAuditLog.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.founderAuditLog.groupBy({ by: ['customerAccountId'], where: { customerAccountId: { not: null } } }),
      prisma.founderAuditLog.groupBy({ by: ['action'], _count: { _all: true } }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const requestedPage = Number.isFinite(filters.page) && (filters.page as number) > 0 ? Math.floor(filters.page as number) : 1;
    const page = Math.min(requestedPage, totalPages);
    const skip = (page - 1) * PAGE_SIZE;

    const administrativeActions = actionGroups
      .filter((group) => auditCategoryFor(group.action) === 'ADMINISTRATION')
      .reduce((sum, group) => sum + group._count._all, 0);

    const rows = total === 0 ? [] : await prisma.founderAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
      include: { customerAccount: { select: { id: true, companyName: true, domain: true } } },
    });

    return {
      ok: true,
      migrationRequired: false,
      kpis: {
        totalEvents,
        todayEvents,
        customersAffected: customerGroups.length,
        administrativeActions,
      },
      rows: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        action: row.action,
        actorEmail: row.actorEmail,
        actorRole: row.actorRole,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata,
        customer: row.customerAccount ? { id: row.customerAccount.id, companyName: row.customerAccount.companyName, domain: row.customerAccount.domain } : null,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages,
      hasAnyEventsAtAll: totalEvents > 0,
    };
  } catch (error) {
    return { ok: false, migrationRequired: missingFounderStorage(error), safeError: safeErrorMessage(error) };
  }
}
