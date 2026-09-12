import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { NotesPortfolioClient } from '@/components/founder/NotesPortfolioClient';
import { getFounderAccess, addCustomerNote, toggleCustomerNotePinned, deleteCustomerNote } from '@/services/founder';
import { buildNotesPortfolio } from '@/services/founder-notes';
import type { CustomerAccountStatus } from '@prisma/client';
import type { NotesCoverage } from '@/lib/founder-notes';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CHURNED']);
const VALID_COVERAGE = new Set(['HAS_NOTES', 'NO_NOTES']);

async function addNote(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await addCustomerNote(access, formData).catch((error) => {
    console.error('[founder-notes] add note failed', error);
  });
  revalidatePath('/founder/notes');
}

async function togglePin(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await toggleCustomerNotePinned(access, formData).catch((error) => {
    console.error('[founder-notes] toggle pin failed', error);
  });
  revalidatePath('/founder/notes');
}

async function removeNote(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await deleteCustomerNote(access, formData).catch((error) => {
    console.error('[founder-notes] delete note failed', error);
  });
  revalidatePath('/founder/notes');
}

export default async function FounderNotesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; coverage?: string; page?: string }>;
}) {
  const access = await getFounderAccess();
  const readOnly = !access.ok || access.readOnly;

  const sp = await searchParams;
  const q = sp?.q ?? '';
  // Every filter value from the query string is validated against its
  // real allowed set before use — a malformed/tampered URL must be
  // ignored rather than reaching Prisma as a raw string (the same
  // hardening applied to Revenue after its own adversarial audit,
  // applied here proactively from the start).
  const status = (VALID_STATUSES.has(sp?.status ?? '') ? sp!.status : '') as CustomerAccountStatus | '';
  const coverage = (VALID_COVERAGE.has(sp?.coverage ?? '') ? sp!.coverage : '') as NotesCoverage | '';
  const page = Math.max(1, Number(sp?.page ?? '1') || 1);

  const result = await buildNotesPortfolio({
    q: q || undefined,
    status: status || undefined,
    coverage: coverage || undefined,
    page,
  });
  const data = result.data;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Customer Success</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Support & Notes</h2>
        <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-600">
          Manage customer context and internal support notes across the ApprovLine customer portfolio. Not visible to customers.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <FounderMetricCard label="Total Notes" value={data.kpis.totalNotes} detail="Across all customer accounts" />
        <FounderMetricCard label="Customers with Notes" value={`${data.kpis.customersWithNotes} / ${data.kpis.totalCustomers}`} detail="At least one note recorded" />
        <FounderMetricCard label="Customers without Notes" value={data.kpis.customersWithoutNotes} detail="No support context recorded" />
        <FounderMetricCard label="Pinned Notes" value={data.kpis.pinnedNotes} detail="Marked important by a Founder" />
      </section>

      <NotesPortfolioClient
        rows={data.rows.map((row) => ({
          ...row,
          latestNote: row.latestNote
            ? { ...row.latestNote, createdAt: row.latestNote.createdAt.toISOString(), updatedAt: row.latestNote.updatedAt.toISOString() }
            : null,
        }))}
        page={data.page}
        totalPages={data.totalPages}
        totalCustomers={data.totalCustomers}
        hasAnyCustomers={data.hasAnyCustomers}
        filters={{ q, status, coverage }}
        canWrite={!readOnly}
        addNoteAction={addNote}
        togglePinAction={togglePin}
        deleteNoteAction={removeNote}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Customer Attention</p>
        <p className="mt-1 text-xs font-semibold text-slate-400">Customers that may need support follow-up.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            href="/founder/notes?coverage=NO_NOTES"
            className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300"
          >
            <div>
              <p className="text-2xl font-black text-amber-800">{data.attention.withoutNotesCount}</p>
              <p className="text-xs font-bold text-amber-800">Customers without notes</p>
              <p className="mt-1 text-[11px] font-semibold text-amber-700">No support context has been recorded.</p>
            </div>
            <span className="text-amber-600" aria-hidden="true">→</span>
          </Link>
          <Link
            href="/founder/notes?coverage=NO_NOTES&status=ACTIVE"
            className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 transition hover:border-rose-300"
          >
            <div>
              <p className="text-2xl font-black text-rose-800">{data.attention.activeWithoutNotesCount}</p>
              <p className="text-xs font-bold text-rose-800">Active customers without notes</p>
              <p className="mt-1 text-[11px] font-semibold text-rose-700">Active accounts with no recorded context.</p>
            </div>
            <span className="text-rose-600" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
