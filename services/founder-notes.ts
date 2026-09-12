/**
 * Support & Notes (/founder/notes) — portfolio-wide Founder workspace for
 * customer support context and notes. Built entirely on the existing
 * CustomerAccount / CustomerNote / CustomerHealth records; introduces no
 * new note, ticket, or support model.
 *
 * ARCHITECTURE AUDIT — what "support" actually means in this codebase:
 *
 *   - CustomerNote (id/customerAccountId/authorEmail/body/pinned/
 *     createdAt/updatedAt) is the ONLY note/support-context model. There
 *     is no ticket, case, SLA, priority, assignee, due-date, or status
 *     field anywhere in the schema for it. "Support & Notes" is
 *     therefore, honestly, a notes/context workspace — not a ticketing
 *     system — and this module never renders Priority/Status/Owner/SLA
 *     columns or badges, since none of those concepts are backed by data.
 *   - A full canonical CRUD mutation set already exists in
 *     services/founder.ts — addCustomerNote, updateCustomerNote,
 *     toggleCustomerNotePinned, deleteCustomerNote — each already
 *     Founder-authorized, read-only-gated, and logged via the one
 *     canonical logFounderAction/FounderAuditLog path. This module reuses
 *     all four verbatim; no second mutation engine is introduced. (The
 *     architecture audit for this task also found and fixed a real,
 *     narrow defect in three of those four functions — see the updated
 *     services/founder.ts comments — where a mismatched noteId/
 *     customerAccountId pair could mutate the wrong customer's note
 *     under the wrong customer's audit attribution; fixed with a
 *     compound where + zero-count guard, with no change to normal-path
 *     behavior.)
 *   - Customer 360 (app/founder/customers/[id]/page.tsx) already owns the
 *     complete, per-customer note history with full inline add/edit/pin/
 *     delete. This module deliberately does NOT re-render that full
 *     history — it shows only each customer's most recent note for fast,
 *     portfolio-wide triage, and links out to Customer 360 for the full
 *     thread. Duplicating that history here would be a second notes UI
 *     for the same data, not a distinct capability.
 *   - Customer Activity is FounderAuditLog, rendered at /founder/audit
 *     (the same page as "Founder Audit Logs" — two nav entry points, one
 *     page, per FounderNavClient's own "duplicate destinations are
 *     intentional" convention). This module never reads AuditLog/
 *     FounderAuditLog directly; it links to /founder/audit?customerAccountId=
 *     (a real, already-supported query param) rather than re-rendering
 *     activity events as if they were notes.
 *   - Founder Attention (/founder/customer-health) is a separate,
 *     CustomerHealth-score-based engine. This module's own "Customer
 *     Attention" section is a narrower, honestly-different signal —
 *     customers with no recorded note — never a recalculated health/risk
 *     score, and never presented as if it were Founder Attention's own
 *     signal.
 *   - CustomerHealth.status is read (not written) here purely as
 *     supplementary drawer context, exactly like every other Commercial/
 *     Customer Success module that shows it — no new health engine.
 *
 * Every filter here (search, account status, notes coverage) is a real
 * column or relation existence check Prisma expresses directly in SQL —
 * `notes: { some: {} } / { none: {} }` for coverage — so, like Revenue,
 * no bounded-fetch-then-filter workaround is needed.
 */
import { prisma } from '@/lib/prisma';
import type { CustomerAccountStatus, CustomerPlanTier, Prisma } from '@prisma/client';
import type { HealthStatus } from '@/lib/customer-health';
import type { NotesCoverage } from '@/lib/founder-notes';

type SafeResult<T> = { data: T; migrationRequired: boolean; safeError?: string };

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').slice(0, 320);
  return String(error).slice(0, 320);
}

function missingFounderStorage(error: unknown): boolean {
  const message = safeErrorMessage(error);
  return message.includes('does not exist') || message.includes('CustomerAccount') || message.includes('CustomerNote');
}

export type NotesRow = {
  id: string;
  companyName: string;
  domain: string;
  primaryAdminEmail: string;
  planTier: CustomerPlanTier;
  status: CustomerAccountStatus;
  healthStatus: HealthStatus | null;
  latestNote: {
    id: string;
    body: string;
    authorEmail: string | null;
    pinned: boolean;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

export type NotesKpis = {
  totalNotes: number;
  totalCustomers: number;
  customersWithNotes: number;
  customersWithoutNotes: number;
  pinnedNotes: number;
};

export type NotesAttention = {
  /** CustomerAccount has zero CustomerNote rows, across the whole portfolio (unfiltered). */
  withoutNotesCount: number;
  /** status = ACTIVE and zero CustomerNote rows. */
  activeWithoutNotesCount: number;
};

export type NotesPortfolio = {
  rows: NotesRow[];
  kpis: NotesKpis;
  attention: NotesAttention;
  page: number;
  totalPages: number;
  totalCustomers: number;
  /** True unfiltered baseline — distinguishes "no customers at all" from "filters matched nothing" (same fix as every other Founder portfolio module). */
  hasAnyCustomers: boolean;
};

export type NotesFilters = {
  q?: string;
  status?: CustomerAccountStatus;
  coverage?: NotesCoverage;
  page?: number;
};

const TAKE = 20;

function coverageFilterFor(coverage: NotesCoverage | undefined): Prisma.CustomerAccountWhereInput | undefined {
  if (coverage === 'HAS_NOTES') return { notes: { some: {} } };
  if (coverage === 'NO_NOTES') return { notes: { none: {} } };
  return undefined;
}

const EMPTY_PORTFOLIO: NotesPortfolio = {
  rows: [],
  kpis: { totalNotes: 0, totalCustomers: 0, customersWithNotes: 0, customersWithoutNotes: 0, pinnedNotes: 0 },
  attention: { withoutNotesCount: 0, activeWithoutNotesCount: 0 },
  page: 1,
  totalPages: 1,
  totalCustomers: 0,
  hasAnyCustomers: false,
};

export async function buildNotesPortfolio(filters: NotesFilters): Promise<SafeResult<NotesPortfolio>> {
  const page = Math.max(1, filters.page ?? 1);
  const skip = (page - 1) * TAKE;
  const q = filters.q?.trim() || undefined;

  const where: Prisma.CustomerAccountWhereInput = {};
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: 'insensitive' } },
      { domain: { contains: q, mode: 'insensitive' } },
      { primaryAdminEmail: { contains: q, mode: 'insensitive' } },
      { notes: { some: { body: { contains: q, mode: 'insensitive' } } } },
    ];
  }
  if (filters.status) where.status = filters.status;
  const coverageFilter = coverageFilterFor(filters.coverage);
  if (coverageFilter) Object.assign(where, coverageFilter);

  try {
    const [
      customers,
      filteredTotal,
      totalCustomers,
      totalNotes,
      customersWithNotes,
      pinnedNotes,
      withoutNotesCount,
      activeWithoutNotesCount,
    ] = await Promise.all([
      prisma.customerAccount.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: TAKE,
        include: { health: { select: { status: true } } },
      }),
      prisma.customerAccount.count({ where }),
      prisma.customerAccount.count(),
      prisma.customerNote.count(),
      // Unfiltered portfolio-wide KPIs, matching every other Founder
      // module's convention of computing headline numbers from the full
      // dataset regardless of the table's active filters.
      prisma.customerAccount.count({ where: { notes: { some: {} } } }),
      prisma.customerNote.count({ where: { pinned: true } }),
      prisma.customerAccount.count({ where: { notes: { none: {} } } }),
      prisma.customerAccount.count({ where: { status: 'ACTIVE', notes: { none: {} } } }),
    ]);

    // Batch-fetch exactly one query for the latest note per customer on
    // THIS page — never a per-row query inside the map below. Prisma's
    // documented distinct+orderBy pattern: ordering by createdAt desc
    // before applying `distinct` means the first row Prisma keeps per
    // customerAccountId is the most recent one.
    const pageIds = customers.map((c) => c.id);
    const latestNotes = pageIds.length
      ? await prisma.customerNote.findMany({
          where: { customerAccountId: { in: pageIds } },
          orderBy: { createdAt: 'desc' },
          distinct: ['customerAccountId'],
        })
      : [];
    const latestNoteByCustomer = new Map(latestNotes.map((n) => [n.customerAccountId, n]));

    const rows: NotesRow[] = customers.map((customer) => {
      const latest = latestNoteByCustomer.get(customer.id);
      return {
        id: customer.id,
        companyName: customer.companyName,
        domain: customer.domain,
        primaryAdminEmail: customer.primaryAdminEmail,
        planTier: customer.planTier,
        status: customer.status,
        healthStatus: (customer.health?.status as HealthStatus | undefined) ?? null,
        latestNote: latest
          ? { id: latest.id, body: latest.body, authorEmail: latest.authorEmail, pinned: latest.pinned, createdAt: latest.createdAt, updatedAt: latest.updatedAt }
          : null,
      };
    });

    return {
      migrationRequired: false,
      data: {
        rows,
        kpis: {
          totalNotes,
          totalCustomers,
          customersWithNotes,
          customersWithoutNotes: totalCustomers - customersWithNotes,
          pinnedNotes,
        },
        attention: { withoutNotesCount, activeWithoutNotesCount },
        page,
        totalPages: Math.max(1, Math.ceil(filteredTotal / TAKE)),
        totalCustomers: filteredTotal,
        hasAnyCustomers: totalCustomers > 0,
      },
    };
  } catch (error) {
    return {
      migrationRequired: missingFounderStorage(error),
      safeError: safeErrorMessage(error),
      data: EMPTY_PORTFOLIO,
    };
  }
}
