'use client';

import { useState, useTransition, useMemo } from 'react';
import {
  Users,
  UserPlus,
  UsersRound,
  Plus,
  Search,
  ChevronDown,
  X,
  Shield,
  Clock,
  Activity,
  Trash2,
  UserMinus,
  Mail,
  Building2,
  Check,
  AlertCircle,
  MoreVertical,
} from 'lucide-react';
import type { UsersTeamsData, UserRow, TeamRow } from '@/services/users';
import { ROLE_LABELS, type Role } from '@/lib/rbac';

type Tab = 'users' | 'teams' | 'roles' | 'invitations' | 'activity';

type Props = {
  data: UsersTeamsData;
  orgName: string;
  currentUserId: string;
  currentUserRole: Role;
};

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-700 border-purple-200',
  ADMIN: 'bg-al-info/15 text-al-accent border-al-info/30',
  MANAGER: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  MEMBER: 'bg-al-surface-elevated text-al-text-secondary border-al-border',
  AUDITOR: 'bg-amber-100 text-al-warning border-al-warning/30',
  VIEWER: 'bg-gray-100 text-gray-500 border-gray-200',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-black ${ROLE_COLORS[role] ?? 'bg-al-surface-elevated text-al-text-secondary border-al-border'}`}>
      {ROLE_LABELS[role as Role] ?? role}
    </span>
  );
}

function Avatar({ name, email, size = 'sm' }: { name: string | null; email: string; size?: 'sm' | 'md' }) {
  const initials = name
    ? name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : email.slice(0, 2).toUpperCase();
  const sz = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  return (
    <div className={`${sz} flex flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-al-accent to-al-accent-hover font-black text-white`}>
      {initials}
    </div>
  );
}

function relDate(date: Date | string): string {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatAction(action: string, metadata: Record<string, unknown>): string {
  switch (action) {
    case 'team.member.role_changed':
      return `Changed ${String(metadata.targetEmail ?? 'member')} role from ${String(metadata.previousRole ?? '?')} to ${String(metadata.newRole ?? '?')}`;
    case 'team.member.added':
      return `Added ${String(metadata.targetEmail ?? 'user')} to ${String(metadata.teamName ?? 'team')}`;
    case 'team.member.removed':
      return `Removed ${String(metadata.targetEmail ?? 'user')} from ${String(metadata.teamName ?? 'team')}`;
    case 'team.created':
      return `Created team "${String(metadata.name ?? '')}"`;
    case 'team.updated':
      return `Updated team "${String(metadata.name ?? '')}"`;
    case 'team.deleted':
      return `Deleted team "${String(metadata.name ?? '')}"`;
    case 'user.invited':
      return `Invited ${String(metadata.email ?? '')} as ${String(metadata.role ?? 'member')}`;
    case 'user.invite_cancelled':
      return `Cancelled invitation for ${String(metadata.email ?? '')}`;
    default:
      return action.replace(/_/g, ' ');
  }
}

const PERMISSION_MATRIX: { permission: string; description: string; roles: Role[] }[] = [
  { permission: 'View approval records', description: 'Read approval history and evidence', roles: ['VIEWER', 'MEMBER', 'AUDITOR', 'MANAGER', 'ADMIN', 'OWNER'] },
  { permission: 'Manage approvals', description: 'Create and update approval records', roles: ['MEMBER', 'MANAGER', 'ADMIN', 'OWNER'] },
  { permission: 'Manage teams', description: 'Create, edit, and delete teams', roles: ['MANAGER', 'ADMIN', 'OWNER'] },
  { permission: 'Invite members', description: 'Send workspace invitations', roles: ['ADMIN', 'OWNER'] },
  { permission: 'Change member roles', description: 'Update roles for other members', roles: ['ADMIN', 'OWNER'] },
  { permission: 'View compliance', description: 'Access Compliance Hub and audit trail', roles: ['AUDITOR', 'ADMIN', 'OWNER'] },
  { permission: 'Manage integrations', description: 'Connect and configure integrations', roles: ['ADMIN', 'OWNER'] },
  { permission: 'View analytics', description: 'Executive analytics and reports', roles: ['ADMIN', 'OWNER'] },
  { permission: 'Manage investigations', description: 'Create and manage investigations', roles: ['MANAGER', 'ADMIN', 'OWNER'] },
  { permission: 'Manage workspace settings', description: 'Organization and identity settings', roles: ['ADMIN', 'OWNER'] },
  { permission: 'Assign owner role', description: 'Promote members to Owner', roles: ['OWNER'] },
];

const ALL_ROLES: Role[] = ['VIEWER', 'AUDITOR', 'MEMBER', 'MANAGER', 'ADMIN', 'OWNER'];

export function UsersTeamsShell({ data, currentUserId, currentUserRole }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamRow | null>(null);
  const [openUserMenu, setOpenUserMenu] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const canAdmin = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';
  const canManage = canAdmin || currentUserRole === 'MANAGER';

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const filteredUsers = useMemo(() => {
    let users = data.users;
    if (roleFilter !== 'all') users = users.filter((u) => u.role === roleFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      users = users.filter((u) => (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    return users;
  }, [data.users, roleFilter, searchQuery]);

  const filteredTeams = useMemo(() => {
    if (!searchQuery.trim()) return data.teams;
    const q = searchQuery.toLowerCase();
    return data.teams.filter((t) => t.name.toLowerCase().includes(q) || (t.department ?? '').toLowerCase().includes(q));
  }, [data.teams, searchQuery]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'users', label: 'Users', icon: <Users className="h-4 w-4" />, count: data.summary.totalUsers },
    { id: 'teams', label: 'Teams', icon: <UsersRound className="h-4 w-4" />, count: data.summary.totalTeams },
    { id: 'roles', label: 'Roles & Permissions', icon: <Shield className="h-4 w-4" /> },
    { id: 'invitations', label: 'Invitations', icon: <Mail className="h-4 w-4" />, count: data.summary.pendingInvites > 0 ? data.summary.pendingInvites : undefined },
    { id: 'activity', label: 'Activity', icon: <Activity className="h-4 w-4" /> },
  ];

  async function handleInvite(formData: FormData) {
    const body = { email: formData.get('email'), name: formData.get('name'), role: formData.get('role') };
    const res = await fetch('/api/users/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      setShowInviteModal(false);
      showToast('Invitation sent.');
      startTransition(() => { window.location.reload(); });
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }));
      showToast(error ?? 'Could not send invitation.', 'error');
    }
  }

  async function handleCreateTeam(formData: FormData) {
    const body = { name: formData.get('name'), department: formData.get('department') || undefined };
    const res = await fetch('/api/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      setShowCreateTeamModal(false);
      showToast('Team created.');
      startTransition(() => { window.location.reload(); });
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }));
      showToast(error ?? 'Could not create team.', 'error');
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    const res = await fetch(`/api/team/members/${userId}/role`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: newRole }) });
    if (res.ok) {
      showToast('Role updated.');
      startTransition(() => { window.location.reload(); });
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }));
      showToast(error ?? 'Could not update role.', 'error');
    }
    setOpenUserMenu(null);
  }

  async function handleCancelInvite(email: string) {
    const res = await fetch(`/api/users/invites/${encodeURIComponent(email)}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Invitation cancelled.');
      startTransition(() => { window.location.reload(); });
    } else {
      showToast('Could not cancel invitation.', 'error');
    }
  }

  async function handleRemoveMember(teamId: string, userId: string) {
    const res = await fetch(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Member removed from team.');
      startTransition(() => { window.location.reload(); });
    } else {
      showToast('Could not remove member.', 'error');
    }
  }

  async function handleDeleteTeam(teamId: string) {
    if (!confirm('Delete this team? Members will not be removed from the workspace.')) return;
    const res = await fetch(`/api/teams/${teamId}`, { method: 'DELETE' });
    if (res.ok) {
      setSelectedTeam(null);
      showToast('Team deleted.');
      startTransition(() => { window.location.reload(); });
    } else {
      showToast('Could not delete team.', 'error');
    }
  }

  return (
    <div className="relative">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-3 rounded-2xl border px-5 py-3 text-sm font-bold shadow-lg ${
          toast.type === 'success' ? 'border-al-success/30 bg-al-success/10 text-al-success' : 'border-al-danger/30 bg-al-danger/10 text-al-danger'
        }`}>
          {toast.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Summary strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total Users" value={data.summary.totalUsers} icon={<Users className="h-5 w-5 text-al-accent" />} />
        <SummaryCard label="Teams" value={data.summary.totalTeams} icon={<UsersRound className="h-5 w-5 text-purple-600" />} />
        <SummaryCard label="Pending Invites" value={data.summary.pendingInvites} icon={<Mail className="h-5 w-5 text-al-warning" />} urgent={data.summary.pendingInvites > 0} />
        <SummaryCard label="Roles in Use" value={Object.keys(data.summary.roleDistribution).length} icon={<Shield className="h-5 w-5 text-indigo-600" />} />
      </div>

      {/* Tab bar + primary actions */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-2xl border border-al-border bg-al-surface-sunken p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition-colors ${
                activeTab === tab.id
                  ? 'bg-al-surface text-al-text shadow-sm'
                  : 'text-al-text-muted hover:text-al-text-secondary'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-black ${activeTab === tab.id ? 'bg-al-surface-elevated text-al-text-secondary' : 'bg-al-border-strong text-al-text-muted'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {canManage && (
            <button
              onClick={() => setShowCreateTeamModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-al-border bg-al-surface px-4 py-2 text-sm font-black text-al-text-secondary shadow-sm hover:bg-al-surface-sunken"
            >
              <Plus className="h-4 w-4" />
              New Team
            </button>
          )}
          {canAdmin && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-al-accent px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-al-accent-hover"
            >
              <UserPlus className="h-4 w-4" />
              Invite User
            </button>
          )}
        </div>
      </div>

      {/* Search + filter bar (users / teams tabs) */}
      {(activeTab === 'users' || activeTab === 'teams') && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-al-text-muted" />
            <input
              type="text"
              placeholder={activeTab === 'users' ? 'Search users by name or email…' : 'Search teams…'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-xl border border-al-border bg-al-surface pl-9 pr-4 text-sm font-semibold text-al-text outline-none placeholder:text-al-text-muted focus:border-al-accent focus:ring-2 focus:ring-al-info/20"
            />
          </div>
          {activeTab === 'users' && (
            <div className="relative">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-10 appearance-none rounded-xl border border-al-border bg-al-surface pl-3 pr-8 text-sm font-semibold text-al-text-secondary outline-none focus:border-al-accent"
              >
                <option value="all">All roles</option>
                {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-al-text-muted" />
            </div>
          )}
        </div>
      )}

      {/* ── USERS TAB ── */}
      {activeTab === 'users' && (
        <div className="overflow-hidden rounded-2xl border border-al-border bg-al-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b border-al-border bg-al-surface-sunken">
                <tr>
                  <th className="px-4 py-3 text-xs font-black uppercase tracking-wide text-al-text-muted">User</th>
                  <th className="px-4 py-3 text-xs font-black uppercase tracking-wide text-al-text-muted">Role</th>
                  <th className="px-4 py-3 text-xs font-black uppercase tracking-wide text-al-text-muted">Teams</th>
                  <th className="px-4 py-3 text-xs font-black uppercase tracking-wide text-al-text-muted">Joined</th>
                  <th className="px-4 py-3 text-xs font-black uppercase tracking-wide text-al-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-al-border">
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm font-semibold text-al-text-muted">No users match your filter.</td></tr>
                )}
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-al-surface-sunken/70">
                    <td className="px-4 py-3">
                      <button onClick={() => setSelectedUser(user)} className="flex items-center gap-3 text-left">
                        <Avatar name={user.name} email={user.email} />
                        <div>
                          <p className="font-black text-al-text">{user.name ?? '—'}</p>
                          <p className="text-xs font-semibold text-al-text-muted">{user.email}</p>
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.teams.length === 0 && <span className="text-xs font-semibold text-al-text-muted">No teams</span>}
                        {user.teams.slice(0, 2).map((t) => (
                          <span key={t.id} className="rounded-lg bg-al-surface-elevated px-2 py-0.5 text-xs font-black text-al-text-secondary">{t.name}</span>
                        ))}
                        {user.teams.length > 2 && <span className="text-xs font-semibold text-al-text-muted">+{user.teams.length - 2}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-al-text-muted">{relDate(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      {canAdmin && user.id !== currentUserId && (
                        <div className="relative">
                          <button
                            onClick={() => setOpenUserMenu(openUserMenu === user.id ? null : user.id)}
                            className="flex items-center justify-center rounded-lg p-1.5 text-al-text-muted hover:bg-al-surface-elevated hover:text-al-text-secondary"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openUserMenu === user.id && (
                            <div className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-xl border border-al-border bg-al-surface shadow-lg">
                              <div className="px-3 py-2 text-xs font-black uppercase tracking-wide text-al-text-muted">Change role</div>
                              {ALL_ROLES.filter((r) => r !== user.role).map((r) => (
                                <button
                                  key={r}
                                  onClick={() => handleRoleChange(user.id, r)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm font-bold text-al-text-secondary hover:bg-al-surface-sunken"
                                >
                                  {ROLE_LABELS[r]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredUsers.length > 0 && (
            <div className="border-t border-al-border px-4 py-2 text-xs font-semibold text-al-text-muted">
              Showing {filteredUsers.length} of {data.users.length} users
            </div>
          )}
        </div>
      )}

      {/* ── TEAMS TAB ── */}
      {activeTab === 'teams' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredTeams.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-al-border-strong bg-al-surface-sunken p-8 text-center">
              <UsersRound className="mx-auto mb-3 h-8 w-8 text-al-text-secondary" />
              <p className="text-sm font-black text-al-text-muted">No teams yet</p>
              <p className="mt-1 text-xs font-semibold text-al-text-muted">Create your first team to organize workspace members.</p>
            </div>
          )}
          {filteredTeams.map((team) => (
            <button
              key={team.id}
              onClick={() => setSelectedTeam(team)}
              className="rounded-2xl border border-al-border bg-al-surface p-5 text-left shadow-sm hover:border-al-accent/30 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100">
                  <UsersRound className="h-5 w-5 text-indigo-600" />
                </div>
                <span className="rounded-full bg-al-surface-elevated px-2.5 py-0.5 text-xs font-black text-al-text-secondary">{team.memberCount} members</span>
              </div>
              <p className="mt-3 font-black text-al-text">{team.name}</p>
              {team.department && <p className="mt-0.5 text-xs font-semibold text-al-text-muted"><Building2 className="mr-1 inline h-3 w-3" />{team.department}</p>}
              <div className="mt-3 flex -space-x-1.5">
                {team.members.slice(0, 5).map((m) => (
                  <Avatar key={m.id} name={m.name} email={m.email} size="sm" />
                ))}
                {team.memberCount > 5 && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-al-surface-elevated text-xs font-black text-al-text-muted">
                    +{team.memberCount - 5}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── ROLES & PERMISSIONS TAB ── */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-al-border bg-al-surface p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-al-accent">Role Distribution</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {ALL_ROLES.map((r) => {
                const count = data.summary.roleDistribution[r] ?? 0;
                return (
                  <div key={r} className="flex items-center gap-2 rounded-2xl border border-al-border bg-al-surface-sunken px-4 py-2.5">
                    <RoleBadge role={r} />
                    <span className="text-sm font-black text-al-text">{count}</span>
                    <span className="text-xs font-semibold text-al-text-muted">user{count !== 1 ? 's' : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-al-border bg-al-surface shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="border-b border-al-border bg-al-surface-sunken">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-al-text-muted">Permission</th>
                    {ALL_ROLES.map((r) => (
                      <th key={r} className="px-3 py-3 text-center text-xs font-black uppercase tracking-wide text-al-text-muted">{ROLE_LABELS[r]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-al-border">
                  {PERMISSION_MATRIX.map((row) => (
                    <tr key={row.permission} className="hover:bg-al-surface-sunken/60">
                      <td className="px-5 py-3">
                        <p className="font-black text-al-text">{row.permission}</p>
                        <p className="mt-0.5 text-xs font-semibold text-al-text-muted">{row.description}</p>
                      </td>
                      {ALL_ROLES.map((r) => (
                        <td key={r} className="px-3 py-3 text-center">
                          {row.roles.includes(r) ? (
                            <Check className="mx-auto h-4 w-4 text-al-success" />
                          ) : (
                            <span className="text-al-text-secondary">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── INVITATIONS TAB ── */}
      {activeTab === 'invitations' && (
        <div className="space-y-4">
          {data.pendingInvites.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-al-border-strong bg-al-surface-sunken p-8 text-center">
              <Mail className="mx-auto mb-3 h-8 w-8 text-al-text-secondary" />
              <p className="text-sm font-black text-al-text-muted">No pending invitations</p>
              <p className="mt-1 text-xs font-semibold text-al-text-muted">Invite team members using the button above.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-al-border bg-al-surface shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="border-b border-al-border bg-al-surface-sunken">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-al-text-muted">Invitee</th>
                      <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-al-text-muted">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-al-text-muted">Invited By</th>
                      <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-al-text-muted">Sent</th>
                      {canAdmin && <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-al-text-muted">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-al-border">
                    {data.pendingInvites.map((invite) => (
                      <tr key={invite.email} className="hover:bg-al-surface-sunken/70">
                        <td className="px-4 py-3">
                          <p className="font-black text-al-text">{invite.name}</p>
                          <p className="text-xs font-semibold text-al-text-muted">{invite.email}</p>
                        </td>
                        <td className="px-4 py-3"><RoleBadge role={invite.role} /></td>
                        <td className="px-4 py-3 text-sm font-semibold text-al-text-secondary">{invite.invitedByName ?? '—'}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-al-text-muted">
                          {invite.invitedAt ? relDate(new Date(invite.invitedAt)) : '—'}
                        </td>
                        {canAdmin && (
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleCancelInvite(invite.email)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-al-danger/30 bg-al-danger/10 px-3 py-1.5 text-xs font-black text-al-danger hover:bg-al-danger/15"
                            >
                              <X className="h-3 w-3" />
                              Cancel
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ACTIVITY TAB ── */}
      {activeTab === 'activity' && (
        <div className="rounded-2xl border border-al-border bg-al-surface shadow-sm">
          {data.recentActivity.length === 0 ? (
            <div className="p-8 text-center">
              <Activity className="mx-auto mb-3 h-8 w-8 text-al-text-secondary" />
              <p className="text-sm font-black text-al-text-muted">No recent activity</p>
              <p className="mt-1 text-xs font-semibold text-al-text-muted">User and team events will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-al-border">
              {data.recentActivity.map((event) => (
                <div key={event.id} className="flex items-start gap-4 px-5 py-4">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-al-surface-elevated">
                    <Activity className="h-4 w-4 text-al-text-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-al-text">{formatAction(event.action, event.metadata)}</p>
                    {event.actorName && (
                      <p className="mt-0.5 text-xs font-semibold text-al-text-muted">by {event.actorName}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-al-text-muted">
                    <Clock className="mr-1 inline h-3 w-3" />
                    {relDate(event.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── USER DETAIL PANEL ── */}
      {selectedUser && (
        <SlidePanel title="User Details" onClose={() => setSelectedUser(null)}>
          <div className="flex items-center gap-4">
            <Avatar name={selectedUser.name} email={selectedUser.email} size="md" />
            <div>
              <p className="text-lg font-black text-al-text">{selectedUser.name ?? '—'}</p>
              <p className="text-sm font-semibold text-al-text-muted">{selectedUser.email}</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            <DetailRow label="Role" value={<RoleBadge role={selectedUser.role} />} />
            <DetailRow label="Joined" value={relDate(selectedUser.createdAt)} />
            <DetailRow label="Teams" value={
              selectedUser.teams.length === 0
                ? <span className="text-al-text-muted">No teams</span>
                : <div className="flex flex-wrap gap-1">{selectedUser.teams.map((t) => <span key={t.id} className="rounded-lg bg-al-surface-elevated px-2 py-0.5 text-xs font-black text-al-text-secondary">{t.name}</span>)}</div>
            } />
          </div>
          {canAdmin && selectedUser.id !== currentUserId && (
            <div className="mt-5">
              <p className="text-xs font-black uppercase tracking-wide text-al-text-muted">Change Role</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ALL_ROLES.filter((r) => r !== selectedUser.role).map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRoleChange(selectedUser.id, r)}
                    className="rounded-lg border border-al-border bg-al-surface px-3 py-1.5 text-xs font-black text-al-text-secondary hover:bg-al-surface-sunken"
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </SlidePanel>
      )}

      {/* ── TEAM DETAIL PANEL ── */}
      {selectedTeam && (
        <SlidePanel title={selectedTeam.name} onClose={() => setSelectedTeam(null)}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100">
              <UsersRound className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="font-black text-al-text">{selectedTeam.name}</p>
              {selectedTeam.department && <p className="text-xs font-semibold text-al-text-muted">{selectedTeam.department}</p>}
            </div>
          </div>
          <div className="mt-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-wide text-al-text-muted">Members ({selectedTeam.memberCount})</p>
            </div>
            <div className="mt-3 space-y-2">
              {selectedTeam.members.length === 0 && (
                <p className="text-sm font-semibold text-al-text-muted">No members yet.</p>
              )}
              {selectedTeam.members.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-xl border border-al-border bg-al-surface-sunken p-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={member.name} email={member.email} size="sm" />
                    <div>
                      <p className="text-sm font-black text-al-text">{member.name ?? member.email}</p>
                      <p className="text-xs font-semibold text-al-text-muted">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <RoleBadge role={member.role} />
                    {canManage && member.id !== currentUserId && (
                      <button
                        onClick={() => handleRemoveMember(selectedTeam.id, member.id)}
                        className="rounded-lg p-1.5 text-al-text-muted hover:bg-al-danger/10 hover:text-al-danger"
                        title="Remove from team"
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {canAdmin && (
            <div className="mt-5 border-t border-al-border pt-4">
              <button
                onClick={() => handleDeleteTeam(selectedTeam.id)}
                className="inline-flex items-center gap-2 rounded-xl border border-al-danger/30 bg-al-danger/10 px-4 py-2 text-sm font-black text-al-danger hover:bg-al-danger/15"
              >
                <Trash2 className="h-4 w-4" />
                Delete Team
              </button>
            </div>
          )}
        </SlidePanel>
      )}

      {/* ── INVITE USER MODAL ── */}
      {showInviteModal && (
        <Modal title="Invite User" onClose={() => setShowInviteModal(false)}>
          <form
            onSubmit={async (e) => { e.preventDefault(); await handleInvite(new FormData(e.currentTarget)); }}
            className="space-y-4"
          >
            <label className="block">
              <span className="text-sm font-black text-al-text-secondary">Full Name</span>
              <input name="name" required placeholder="Jane Smith" className="mt-1 h-11 w-full rounded-xl border border-al-border px-3 text-sm font-semibold outline-none focus:border-al-accent focus:ring-2 focus:ring-al-info/20" />
            </label>
            <label className="block">
              <span className="text-sm font-black text-al-text-secondary">Email Address</span>
              <input name="email" type="email" required placeholder="jane@company.com" className="mt-1 h-11 w-full rounded-xl border border-al-border px-3 text-sm font-semibold outline-none focus:border-al-accent focus:ring-2 focus:ring-al-info/20" />
            </label>
            <label className="block">
              <span className="text-sm font-black text-al-text-secondary">Role</span>
              <select name="role" defaultValue="MEMBER" className="mt-1 h-11 w-full rounded-xl border border-al-border bg-al-surface px-3 text-sm font-semibold outline-none focus:border-al-accent">
                {ALL_ROLES.filter((r) => r !== 'OWNER').map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowInviteModal(false)} className="rounded-xl border border-al-border px-4 py-2.5 text-sm font-black text-al-text-secondary hover:bg-al-surface-sunken">Cancel</button>
              <button type="submit" disabled={isPending} className="rounded-xl bg-al-accent px-5 py-2.5 text-sm font-black text-white hover:bg-al-accent-hover disabled:opacity-60">
                Send Invitation
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── CREATE TEAM MODAL ── */}
      {showCreateTeamModal && (
        <Modal title="Create Team" onClose={() => setShowCreateTeamModal(false)}>
          <form
            onSubmit={async (e) => { e.preventDefault(); await handleCreateTeam(new FormData(e.currentTarget)); }}
            className="space-y-4"
          >
            <label className="block">
              <span className="text-sm font-black text-al-text-secondary">Team Name</span>
              <input name="name" required placeholder="Engineering, Legal, Finance…" className="mt-1 h-11 w-full rounded-xl border border-al-border px-3 text-sm font-semibold outline-none focus:border-al-accent focus:ring-2 focus:ring-al-info/20" />
            </label>
            <label className="block">
              <span className="text-sm font-black text-al-text-secondary">Department <span className="font-semibold text-al-text-muted">(optional)</span></span>
              <input name="department" placeholder="e.g. Finance, Legal" className="mt-1 h-11 w-full rounded-xl border border-al-border px-3 text-sm font-semibold outline-none focus:border-al-accent focus:ring-2 focus:ring-al-info/20" />
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowCreateTeamModal(false)} className="rounded-xl border border-al-border px-4 py-2.5 text-sm font-black text-al-text-secondary hover:bg-al-surface-sunken">Cancel</button>
              <button type="submit" disabled={isPending} className="rounded-xl bg-al-accent px-5 py-2.5 text-sm font-black text-white hover:bg-al-accent-hover disabled:opacity-60">
                Create Team
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, urgent }: { label: string; value: number; icon: React.ReactNode; urgent?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-al-surface p-4 shadow-sm ${urgent ? 'border-al-warning/30' : 'border-al-border'}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wide text-al-text-muted">{label}</span>
        {icon}
      </div>
      <p className={`mt-2 text-2xl font-black ${urgent ? 'text-al-warning' : 'text-al-text'}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-al-border bg-al-surface-sunken px-4 py-3">
      <span className="text-xs font-black uppercase tracking-wide text-al-text-muted">{label}</span>
      <span className="text-right text-sm font-bold text-al-text">{value}</span>
    </div>
  );
}

function SlidePanel({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 right-0 top-0 z-40 w-full max-w-sm overflow-y-auto border-l border-al-border bg-al-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-al-border px-5 py-4">
          <p className="text-base font-black text-al-text">{title}</p>
          <button onClick={onClose} className="rounded-lg p-1.5 text-al-text-muted hover:bg-al-surface-elevated"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-40 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-al-border bg-al-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-lg font-black text-al-text">{title}</p>
          <button onClick={onClose} className="rounded-lg p-1.5 text-al-text-muted hover:bg-al-surface-elevated"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </>
  );
}
