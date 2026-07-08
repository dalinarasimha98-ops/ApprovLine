import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FounderBadge, FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import {
  founderInviteLink,
  founderManagedUserRoles,
  getFounderAccess,
  inviteFounderCustomerUser,
  listFounderCustomerUsers,
  updateCustomerSeats,
  updateFounderCustomerUser,
} from '@/services/founder';

export const dynamic = 'force-dynamic';

async function inviteUser(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  await inviteFounderCustomerUser(access, formData);
  revalidatePath(`/founder/customers/${String(formData.get('customerAccountId'))}/users`);
  revalidatePath(`/founder/customers/${String(formData.get('customerAccountId'))}`);
}

async function updateUser(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  await updateFounderCustomerUser(access, formData);
  revalidatePath(`/founder/customers/${String(formData.get('customerAccountId'))}/users`);
  revalidatePath(`/founder/customers/${String(formData.get('customerAccountId'))}`);
}

async function updateSeats(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  await updateCustomerSeats(access, formData);
  revalidatePath(`/founder/customers/${String(formData.get('customerAccountId'))}/users`);
  revalidatePath(`/founder/customers/${String(formData.get('customerAccountId'))}`);
}

export default async function FounderCustomerUsersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getFounderAccess();
  const result = await listFounderCustomerUsers(id);
  if (!result.data && !result.migrationRequired) notFound();

  if (!result.data) {
    return <MigrationNotice message={result.safeError} />;
  }

  const { customer, seats } = result.data;
  const seatTone = seats.usagePercent >= 100 ? 'red' : seats.usagePercent >= 90 ? 'amber' : seats.usagePercent >= 80 ? 'blue' : 'green';

  return (
    <div className="space-y-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <Link href={`/founder/customers/${customer.id}`} className="text-xs font-black uppercase tracking-wide text-[#2557dc]">Back to customer</Link>
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Customer User Lifecycle</p>
            <h2 className="mt-2 text-3xl font-black text-slate-950">{customer.companyName}</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">Invite users, enforce seats, change roles, and manage access status.</p>
          </div>
          <FounderBadge tone={seatTone}>Seat usage {seats.usagePercent}%</FounderBadge>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <FounderMetricCard label="Purchased" value={seats.purchasedSeats} detail="Contracted workspace seats" />
        <FounderMetricCard label="Active" value={seats.usedSeats} detail="Used seats from active users" />
        <FounderMetricCard label="Reserved" value={seats.reservedSeats} detail="Active plus invited users" />
        <FounderMetricCard label="Available" value={seats.availableSeats} detail="Remaining invite capacity" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          {access.ok && !access.readOnly ? (
            <>
              <form action={inviteUser} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <input type="hidden" name="customerAccountId" value={customer.id} />
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Invite user</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input name="firstName" placeholder="First name" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#2557dc]" />
                  <input name="lastName" placeholder="Last name" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#2557dc]" />
                  <input name="email" type="email" placeholder="name@company.com" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#2557dc] sm:col-span-2" />
                  <select name="role" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#2557dc] sm:col-span-2" defaultValue="VIEWER">
                    {founderManagedUserRoles.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
                  </select>
                </div>
                <button disabled={seats.availableSeats <= 0} className="mt-4 w-full rounded-xl bg-[#2557dc] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                  {seats.availableSeats <= 0 ? 'Seat limit reached' : 'Generate invite'}
                </button>
              </form>

              <form action={updateSeats} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <input type="hidden" name="customerAccountId" value={customer.id} />
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Seat upgrade</p>
                <label className="mt-4 block text-sm font-black text-slate-700" htmlFor="purchasedSeats">Purchased seats</label>
                <input id="purchasedSeats" name="purchasedSeats" type="number" min={seats.usedSeats} defaultValue={seats.purchasedSeats} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#2557dc]" />
                <button className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">Update seats</button>
              </form>
            </>
          ) : null}
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Users</p>
            <h3 className="mt-2 text-xl font-black text-slate-950">Lifecycle and roles</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {customer.managedUsers.map((user) => (
              <div key={user.id} className="p-5">
                <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                  <div>
                    <p className="text-lg font-black text-slate-950">{user.firstName} {user.lastName}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{user.email}</p>
                    {user.status === 'INVITED' && user.inviteToken ? (
                      <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
                        Invite link: {founderInviteLink(user.email)}&invite={user.inviteToken}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <FounderBadge tone={user.status === 'ACTIVE' ? 'green' : user.status === 'SUSPENDED' ? 'red' : user.status === 'INVITED' ? 'blue' : 'slate'}>{user.status}</FounderBadge>
                    <FounderBadge tone="slate">{user.role.replace('_', ' ')}</FounderBadge>
                  </div>
                </div>
                {access.ok && !access.readOnly ? (
                  <form action={updateUser} className="mt-4 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="customerAccountId" value={customer.id} />
                    <input type="hidden" name="userId" value={user.id} />
                    <select name="role" defaultValue={user.role} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black">
                      {founderManagedUserRoles.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
                    </select>
                    <button name="action" value="role" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black">Change role</button>
                    <button name="action" value={user.status === 'SUSPENDED' ? 'activate' : 'suspend'} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">{user.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}</button>
                    <button name="action" value="resend" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">Resend invite</button>
                    <button name="action" value="revoke" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black">Revoke invite</button>
                    <button name="action" value="remove" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">Remove</button>
                  </form>
                ) : null}
              </div>
            ))}
            {!customer.managedUsers.length ? (
              <div className="p-10 text-center">
                <p className="text-lg font-black text-slate-950">No managed users yet</p>
                <p className="mt-2 text-sm font-semibold text-slate-500">Invite the customer admin or pilot team to start tracking seats.</p>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </div>
  );
}
