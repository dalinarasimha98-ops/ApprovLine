import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { FounderBadge, MigrationNotice } from '@/components/founder/FounderShell';
import { getFounderAccess, addCustomerNote, deleteCustomerNote, toggleCustomerNotePinned, listCustomerAccountOptions } from '@/services/founder';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function createNote(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await addCustomerNote(access, formData).catch((error) => {
    console.error('[founder-notes] create failed', error);
  });
  revalidatePath('/founder/notes');
}

async function pinNote(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await toggleCustomerNotePinned(access, formData).catch((error) => {
    console.error('[founder-notes] pin failed', error);
  });
  revalidatePath('/founder/notes');
}

async function removeNote(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await deleteCustomerNote(access, formData).catch((error) => {
    console.error('[founder-notes] delete failed', error);
  });
  revalidatePath('/founder/notes');
}

type NoteRow = {
  id: string;
  body: string;
  authorEmail: string;
  pinned: boolean;
  createdAt: Date;
  customerAccountId: string;
  customerAccount: { id: string; companyName: string; domain: string } | null;
};

export default async function FounderNotesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; customerAccountId?: string }>;
}) {
  const params = await searchParams;
  const access = await getFounderAccess();
  const readOnly = !access.ok || access.readOnly;

  let notes: NoteRow[] = [];
  let migrationRequired = false;
  let safeError: string | undefined;
  let total = 0;
  let pinned = 0;

  try {
    const where: Record<string, unknown> = {};
    if (params?.customerAccountId) where.customerAccountId = params.customerAccountId;
    if (params?.q) {
      where.body = { contains: params.q, mode: 'insensitive' };
    }

    [notes, total, pinned] = await Promise.all([
      prisma.customerNote.findMany({
        where,
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        include: { customerAccount: { select: { id: true, companyName: true, domain: true } } },
      }) as Promise<NoteRow[]>,
      prisma.customerNote.count(),
      prisma.customerNote.count({ where: { pinned: true } }),
    ]);
  } catch (error) {
    migrationRequired = true;
    safeError = (error instanceof Error ? error.message : String(error)).slice(0, 220);
  }

  const customers = await listCustomerAccountOptions().catch(() => []);

  return (
    <div className="space-y-6">
      {migrationRequired ? <MigrationNotice message={safeError} /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Support / Notes</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Customer notes hub</h2>
            <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-600">
              Internal support notes, context, and flags across all customer accounts. Not visible to customers.
            </p>
          </div>
          <div className="flex gap-2">
            <FounderBadge tone="slate">{total} notes</FounderBadge>
            <FounderBadge tone="amber">{pinned} pinned</FounderBadge>
          </div>
        </div>

        <form className="mt-5 flex flex-wrap gap-3">
          <input
            name="q"
            defaultValue={params?.q ?? ''}
            placeholder="Search notes"
            className="min-h-10 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100"
          />
          <select name="customerAccountId" defaultValue={params?.customerAccountId ?? ''} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-[#2557dc]">
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.companyName}</option>
            ))}
          </select>
          <button className="rounded-xl bg-[#2557dc] px-5 py-2 text-sm font-black text-white">Filter</button>
        </form>
      </section>

      {/* Add note */}
      {!readOnly ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Add note</p>
          <form action={createNote} className="mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <select required name="customerAccountId" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#2557dc]">
                <option value="">Select customer account</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.companyName} · {c.domain}</option>
                ))}
              </select>
            </div>
            <textarea
              required
              name="body"
              rows={3}
              placeholder="Add an internal support note…"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100"
            />
            <div className="flex justify-end">
              <button className="rounded-xl bg-[#2557dc] px-5 py-2.5 text-sm font-black text-white hover:bg-blue-700">
                Save note
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {/* Notes list */}
      <div className="grid gap-4">
        {notes.length ? (
          notes.map((note) => (
            <article key={note.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${note.pinned ? 'border-amber-200' : 'border-slate-200'}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {note.customerAccount ? (
                      <Link href={`/founder/customers/${note.customerAccount.id}`} className="font-black text-[#2557dc] hover:text-blue-700">
                        {note.customerAccount.companyName}
                      </Link>
                    ) : null}
                    {note.pinned ? <FounderBadge tone="amber">Pinned</FounderBadge> : null}
                    <span className="text-xs font-semibold text-slate-400">{note.authorEmail} · {note.createdAt.toLocaleString()}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-700 whitespace-pre-line">{note.body}</p>
                </div>
                {!readOnly ? (
                  <div className="flex shrink-0 gap-2">
                    <form action={pinNote}>
                      <input type="hidden" name="noteId" value={note.id} />
                      <input type="hidden" name="customerAccountId" value={note.customerAccountId} />
                      <input type="hidden" name="pinned" value={note.pinned ? 'false' : 'true'} />
                      <button className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-black text-amber-700 hover:bg-amber-100">
                        {note.pinned ? 'Unpin' : 'Pin'}
                      </button>
                    </form>
                    <form action={removeNote}>
                      <input type="hidden" name="noteId" value={note.id} />
                      <input type="hidden" name="customerAccountId" value={note.customerAccountId} />
                      <button className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-100">
                        Delete
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="font-black text-slate-950">No notes yet</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {params?.q ? 'No notes match your search.' : 'Add the first support note above.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
