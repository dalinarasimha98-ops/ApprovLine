import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { FounderBadge, MigrationNotice } from '@/components/founder/FounderShell';
import { getFounderAccess, inviteFounderCustomerUser, updateFounderCustomerUser, listCustomerAccountOptions } from '@/services/founder';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function inviteUser(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await inviteFounderCustomerUser(access, formData).catch((error) => {
    console.error('[founder-users] invite failed', error);
  });
  revalidatePath('/founder/users');
}

async function updateUser(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await updateFounderCustomerUser(access, formData).catch((error) => {
    console.error('[founder-users] user update failed', error);
  });
  revalidatePath('/founder/users');
}

function statusTone(status: string): 'green' | 'amber' | 'red' | 'slate' | 'blue' {
  if (status === 'ACTIVE') return 'green';
  if (status === 'INVITED') return 'blue';
  if (status === 'SUSPENDED') return 'red';
  return 'slate';
}

type ManagedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  invitedAt: Date | null;
  acceptedAt: Date | null;
  customerAccountId: string;
  customerAccount?: { companyName: string; domain: string } | null;
};

export default async function FounderUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; customerAccountId?: string }>;
}) {
  const params = await searchParams;
  const access = await getFounderAccess();
  const readOnly = !access.ok || access.readOnly;

  let users: ManagedUser[] = [];
  let migrationRequired = false;
  let safeError: string | undefined;
  let total = 0;
  let activeCount = 0;
  let invitedCount = 0;

  try {
    const where: Record<string, unknown> = {};
    if (params?.q) {
      const q = params.q.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (params?.status) where.status = params.status;
    if (params?.customerAccountId) where.customerAccountId = params.customerAccountId;

    [users, total, activeCount, invitedCount] = await Promise.all([
      prisma.founderManagedUser.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { customerAccount: { select: { companyName: true, domain: true } } },
      }) as Promise<ManagedUser[]>,
      prisma.founderManagedUser.count(),
      prisma.founderManagedUser.count({ where: { status: 'ACTIVE' } }),
      prisma.founderManagedUser.count({ where: { status: 'INVITED' } }),
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
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Users</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Managed users</h2>
            <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-600">
              Invite, activate, suspend, and remove customer workspace users across all accounts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FounderBadge tone="blue">{total} total</FounderBadge>
            <FounderBadge tone="green">{activeCount} active</FounderBadge>
            <FounderBadge tone="amber">{invitedCount} invited</FounderBadge>
          </div>
        </div>

        <form className="mt-5 flex flex-wrap gap-3">
          <input
            name="q"
            defaultValue={params?.q ?? ''}
            placeholder="Search name or email"
            className="min-h-10 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100"
          />
          <select name="customerAccountId" defaultValue={params?.customerAccountId ?? ''} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-[#2557dc]">
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.companyName}</option>
            ))}
          </select>
          <select name="status" defaultValue={params?.status ?? ''} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-[#2557dc]">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INVITED">Invited</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="REMOVED">Removed</option>
            <option value="REVOKED">Revoked</option>
          </select>
          <button className="rounded-xl bg-[#2557dc] px-5 py-2 text-sm font-black text-white">Filter</button>
        </form>
      </section>

      {/* Invite form */}
      {!readOnly ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Invite user</p>
          <form action={inviteUser} className="mt-4 grid gap-3 md:grid-cols-6">
            <input required name="firstName" placeholder="First name" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100" />
            <input required name="lastName" placeholder="Last name" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100" />
            <input required type="email" name="email" placeholder="Email address" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100 md:col-span-2" />
            <select required name="customerAccountId" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#2557dc]">
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </select>
            <button className="rounded-xl bg-[#2557dc] px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700">
              Send invite
            </button>
          </form>
        </section>
      ) : null}

      {/* User table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Invited</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length ? (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-950">{user.firstName} {user.lastName}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">{user.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      {user.customerAccount ? (
                        <Link href={`/founder/customers/${user.customerAccountId}`} className="font-bold text-[#2557dc] hover:text-blue-700">
                          {user.customerAccount.companyName}
                        </Link>
                      ) : (
                        <span className="font-semibold text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-700">{user.role.replace('_', ' ')}</td>
                    <td className="px-5 py-4">
                      <FounderBadge tone={statusTone(user.status)}>{user.status}</FounderBadge>
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-500">
                      {user.invitedAt?.toLocaleDateString() ?? '—'}
                    </td>
                    <td className="px-5 py-4">
                      {!readOnly ? (
                        <div className="flex justify-end gap-2">
                          {user.status === 'INVITED' ? (
                            <form action={updateUser}>
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="customerAccountId" value={user.customerAccountId} />
                              <input type="hidden" name="action" value="revoke" />
                              <button className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50">
                                Revoke
                              </button>
                            </form>
                          ) : null}
                          {user.status === 'ACTIVE' ? (
                            <form action={updateUser}>
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="customerAccountId" value={user.customerAccountId} />
                              <input type="hidden" name="action" value="suspend" />
                              <button className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-black text-rose-700">
                                Suspend
                              </button>
                            </form>
                          ) : null}
                          {user.status === 'SUSPENDED' ? (
                            <form action={updateUser}>
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="customerAccountId" value={user.customerAccountId} />
                              <input type="hidden" name="action" value="activate" />
                              <button className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-black text-emerald-700">
                                Reactivate
                              </button>
                            </form>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <p className="font-black text-slate-950">No users found</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {params?.q ? 'Adjust your search.' : 'Invite users to a customer account above.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
