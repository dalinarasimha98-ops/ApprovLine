import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FounderBadge, FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import {
  addCustomerNote,
  deleteCustomerNote,
  deleteFounderCustomer,
  founderInviteLink,
  getFounderAccess,
  getFounderCustomerProfile,
  toggleCustomerNotePinned,
  updateCustomerNote,
  updateCustomerStatus,
} from '@/services/founder';

export const dynamic = 'force-dynamic';

async function createNote(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  await addCustomerNote(access, formData);
  revalidatePath(`/founder/customers/${String(formData.get('customerAccountId'))}`);
}

async function editNote(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  await updateCustomerNote(access, formData);
  revalidatePath(`/founder/customers/${String(formData.get('customerAccountId'))}`);
}

async function pinNote(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  await toggleCustomerNotePinned(access, formData);
  revalidatePath(`/founder/customers/${String(formData.get('customerAccountId'))}`);
}

async function removeNote(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  await deleteCustomerNote(access, formData);
  revalidatePath(`/founder/customers/${String(formData.get('customerAccountId'))}`);
}

async function changeStatus(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  const customerId = String(formData.get('customerAccountId') ?? '');
  await updateCustomerStatus(access, customerId, String(formData.get('status') ?? 'ACTIVE'));
  revalidatePath(`/founder/customers/${customerId}`);
  revalidatePath('/founder/customers');
}

async function deleteCustomer(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  await deleteFounderCustomer(access, formData);
  revalidatePath('/founder/customers');
}

export default async function FounderCustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getFounderAccess();
  const result = await getFounderCustomerProfile(id);
  if (!result.data && !result.migrationRequired) notFound();

  if (!result.data) {
    return (
      <div className="space-y-6">
        <MigrationNotice message={result.safeError} />
      </div>
    );
  }

  const { customer, usage } = result.data;
  const inviteLink = founderInviteLink(customer.primaryAdminEmail);
  const activeUsers = customer.managedUsers.filter((user) => user.status === 'ACTIVE').length;
  const purchasedSeats = customer.seatAllocation?.purchasedSeats ?? customer.seatAllocation?.allocatedSeats ?? 5;
  const availableSeats = Math.max(0, purchasedSeats - customer.managedUsers.filter((user) => user.status === 'ACTIVE' || user.status === 'INVITED').length);

  return (
    <div className="space-y-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Customer Profile</p>
            <h2 className="mt-2 text-3xl font-black text-slate-950">{customer.companyName}</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">{customer.domain} · Primary admin: {customer.primaryAdminEmail}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FounderBadge tone={customer.status === 'ACTIVE' ? 'green' : customer.status === 'SUSPENDED' ? 'red' : 'amber'}>{customer.status}</FounderBadge>
            <FounderBadge tone="blue">{customer.planTier.replace('_', ' ')}</FounderBadge>
            <FounderBadge tone="slate">Retention {customer.dataRetentionDays}d</FounderBadge>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/founder/customers/${customer.id}/users`} className="rounded-xl bg-[#2557dc] px-4 py-3 text-sm font-black text-white">
            Manage users and seats
          </Link>
          {access.ok && !access.readOnly ? (
            <>
              <form action={changeStatus}>
                <input type="hidden" name="customerAccountId" value={customer.id} />
                <input type="hidden" name="status" value={customer.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'} />
                <button className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">
                  {customer.status === 'SUSPENDED' ? 'Reactivate customer' : 'Suspend customer'}
                </button>
              </form>
              <form action={changeStatus}>
                <input type="hidden" name="customerAccountId" value={customer.id} />
                <input type="hidden" name="status" value="CHURNED" />
                <button className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">Archive customer</button>
              </form>
            </>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FounderMetricCard label="Seats" value={`${activeUsers}/${purchasedSeats}`} detail={`${availableSeats} available seats after invited users`} />
        <FounderMetricCard label="Approvals" value={usage.approvals} detail="Captured in this workspace" />
        <FounderMetricCard label="Audit logs" value={usage.auditLogs} detail="Customer-side evidence logs" />
        <FounderMetricCard label="Health" value={`${customer.health?.score ?? 50}/100`} detail={(customer.health?.status ?? 'NEEDS_ATTENTION').replace('_', ' ')} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Feature flags</p>
            <div className="mt-4 grid gap-3">
              {customer.featureFlags.map((flag) => (
                <div key={flag.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <p className="font-black text-slate-950">{flag.key.replaceAll('_', ' ')}</p>
                    <p className="text-xs font-semibold text-slate-500">{flag.category ?? 'General'} · Updated by {flag.updatedBy ?? 'system'}</p>
                  </div>
                  <FounderBadge tone={flag.enabled ? 'green' : 'slate'}>{flag.enabled ? 'Enabled' : 'Disabled'}</FounderBadge>
                </div>
              ))}
              {!customer.featureFlags.length ? <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No founder feature flags configured yet.</p> : null}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Integration access</p>
            <div className="mt-4 grid gap-3">
              {customer.integrationStatuses.map((integration) => (
                <div key={integration.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <p className="font-black text-slate-950">{integration.provider.replaceAll('_', ' ')}</p>
                    <p className="text-xs font-semibold text-slate-500">Customer IT owns credentials and OAuth setup</p>
                  </div>
                  <FounderBadge tone={integration.connectionState === 'CONNECTED' ? 'green' : integration.accessEnabled ? 'blue' : 'slate'}>
                    {integration.connectionState.replace('_', ' ')}
                  </FounderBadge>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Managed users</p>
              <Link href={`/founder/customers/${customer.id}/users`} className="text-xs font-black uppercase tracking-wide text-[#2557dc]">
                Open lifecycle
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              {customer.managedUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <p className="font-black text-slate-950">{user.firstName} {user.lastName}</p>
                    <p className="text-xs font-semibold text-slate-500">{user.email} · {user.role.replace('_', ' ')}</p>
                  </div>
                  <FounderBadge tone={user.status === 'ACTIVE' ? 'green' : user.status === 'SUSPENDED' ? 'red' : user.status === 'INVITED' ? 'blue' : 'slate'}>
                    {user.status}
                  </FounderBadge>
                </div>
              ))}
              {!customer.managedUsers.length ? <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No managed customer users yet.</p> : null}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Admin invite</p>
            <h3 className="mt-2 text-xl font-black text-slate-950">Invite customer admin</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Send this sign-up link manually to the customer admin. ApprovLine does not store their integration credentials.</p>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs font-bold text-slate-600">{inviteLink}</div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Customer notes</p>
            {access.ok && !access.readOnly ? (
              <form action={createNote} className="mt-4 grid gap-3">
                <input type="hidden" name="customerAccountId" value={customer.id} />
                <textarea name="body" placeholder="Add founder/customer success note" className="min-h-28 rounded-2xl border border-slate-200 p-4 text-sm font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100" />
                <button className="rounded-xl bg-[#2557dc] px-4 py-3 text-sm font-black text-white">Save note</button>
              </form>
            ) : null}
            <div className="mt-5 grid gap-3">
              {customer.notes.map((note) => (
                <div key={note.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-500">{note.authorEmail ?? 'Founder'} · {note.createdAt.toLocaleString()}</p>
                    {note.pinned ? <FounderBadge tone="blue">Pinned</FounderBadge> : null}
                  </div>
                  {access.ok && !access.readOnly ? (
                    <form action={editNote} className="grid gap-3">
                      <input type="hidden" name="customerAccountId" value={customer.id} />
                      <input type="hidden" name="noteId" value={note.id} />
                      <textarea name="body" defaultValue={note.body} className="min-h-20 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#2557dc]" />
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Update</button>
                        <button formAction={pinNote} name="pinned" value={note.pinned ? 'false' : 'true'} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                          {note.pinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button formAction={removeNote} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">Delete</button>
                      </div>
                    </form>
                  ) : (
                    <p className="text-sm font-semibold leading-6 text-slate-700">{note.body}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Founder audit trail</p>
            <div className="mt-4 grid gap-3">
              {customer.auditLogs.map((log) => (
                <div key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-black text-slate-950">{log.action}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{log.actorEmail ?? 'system'} · {log.createdAt.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
          {access.ok && access.role === 'SUPER_ADMIN' ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-700">Danger zone</p>
              <h3 className="mt-2 text-xl font-black text-slate-950">Delete customer</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-rose-900">This permanently removes the founder customer account record and cascades founder operational data. Type the company name to confirm.</p>
              <form action={deleteCustomer} className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input type="hidden" name="customerAccountId" value={customer.id} />
                <input name="confirmation" placeholder={customer.companyName} className="min-h-12 flex-1 rounded-xl border border-rose-200 bg-white px-4 text-sm font-bold outline-none" />
                <button className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-black text-white">Delete</button>
              </form>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
