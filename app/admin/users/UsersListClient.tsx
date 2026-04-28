'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Avatar } from '@/components/ui/Avatar';

interface CompanySummary {
  id: string;
  name: string;
  slug: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: 'SUPERADMIN' | 'OWNER' | 'ADMIN' | 'VIEWER';
  avatarUrl: string | null;
  status: 'active' | 'locked' | 'pending';
  inviteAcceptedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  company: CompanySummary | null;
}

interface UsersListClientProps {
  companies: CompanySummary[];
  currentUserId: string;
}

export function UsersListClient({ companies, currentUserId }: UsersListClientProps) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [companyFilter, setCompanyFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showInviteModal, setShowInviteModal] = useState<'team' | 'company' | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (roleFilter) params.set('role', roleFilter);
    if (companyFilter) params.set('companyId', companyFilter);
    if (statusFilter) params.set('status', statusFilter);

    try {
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setUsers(data.users);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, companyFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  function flash(type: 'ok' | 'err', msg: string) {
    setActionMessage({ type, msg });
    setTimeout(() => setActionMessage(null), 4000);
  }

  async function handleAction(userId: string, action: 'resend-invite' | 'reset-password' | 'terminate-sessions' | 'toggle-active' | 'delete', currentActive?: boolean) {
    if (action === 'delete') {
      if (!confirm('Permanently delete this user? This cannot be undone.')) return;
    }
    if (action === 'terminate-sessions') {
      if (!confirm('Sign this user out from all devices?')) return;
    }

    try {
      let res: Response;
      if (action === 'resend-invite') {
        res = await fetch(`/api/admin/users/${userId}/resend-invite`, { method: 'POST' });
      } else if (action === 'reset-password') {
        res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: 'POST' });
      } else if (action === 'terminate-sessions') {
        res = await fetch(`/api/admin/users/${userId}/sessions`, { method: 'DELETE' });
      } else if (action === 'toggle-active') {
        res = await fetch(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: !currentActive }),
        });
      } else {
        res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Action failed');

      const messages = {
        'resend-invite': 'Invite email sent',
        'reset-password': 'Password reset email sent',
        'terminate-sessions': `Terminated ${data.terminated ?? 0} sessions`,
        'toggle-active': currentActive ? 'User disabled' : 'User enabled',
        'delete': 'User deleted',
      };
      flash('ok', messages[action]);
      await fetchUsers();
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Action failed');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-1">All users</div>
          <h1 className="font-display italic text-3xl text-ink">Users</h1>
          <p className="text-sm text-ink-dim mt-1">Manage all users across Perenne and customer companies</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowInviteModal('team')}
            className="px-4 py-2 rounded-2xl border border-glass-border bg-white/[0.04] text-ink text-sm hover:bg-white/[0.08] transition"
          >
            + Invite Perenne member
          </button>
          <button
            onClick={() => setShowInviteModal('company')}
            className="px-4 py-2 rounded-2xl bg-accent text-white text-sm hover:bg-accent-bright transition shadow-lg shadow-accent/20"
          >
            + Invite to a company
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center p-3 rounded-2xl bg-white/[0.02] border border-glass-border">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-white/[0.04] border border-glass-border text-ink text-sm placeholder-ink-faint focus:outline-none focus:border-accent/50"
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={selectClass}>
          <option value="">All roles</option>
          <option value="SUPERADMIN">Perenne team</option>
          <option value="OWNER">Owner</option>
          <option value="ADMIN">Admin</option>
          <option value="VIEWER">Viewer</option>
        </select>
        <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className={selectClass}>
          <option value="">All companies</option>
          <option value="none">No company (Perenne)</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending invite</option>
          <option value="locked">Locked / Disabled</option>
        </select>
      </div>

      {actionMessage && (
        <div className={`p-3 rounded-xl text-sm font-mono ${actionMessage.type === 'ok' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200' : 'bg-red-400/5 border border-red-400/20 text-red-200'}`}>
          {actionMessage.type === 'ok' ? '✓' : '⊘'} {actionMessage.msg}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl text-sm font-mono bg-red-400/5 border border-red-400/20 text-red-200">
          ⊘ {error}
        </div>
      )}

      {/* Users table */}
      <div className="rounded-2xl bg-white/[0.02] border border-glass-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] font-mono text-ink-faint tracking-widest uppercase border-b border-glass-border">
              <th className="text-left p-4 font-medium">User</th>
              <th className="text-left p-4 font-medium">Role</th>
              <th className="text-left p-4 font-medium">Company</th>
              <th className="text-left p-4 font-medium">Status</th>
              <th className="text-right p-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="p-8 text-center text-ink-faint text-sm">Loading…</td></tr>
            )}
            {!loading && users.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-ink-faint text-sm">No users found</td></tr>
            )}
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === currentUserId}
                onAction={handleAction}
              />
            ))}
          </tbody>
        </table>
      </div>

      {showInviteModal && (
        <InviteModal
          mode={showInviteModal}
          companies={companies}
          onClose={() => setShowInviteModal(null)}
          onSuccess={async (email) => {
            setShowInviteModal(null);
            flash('ok', `Invite sent to ${email}`);
            await fetchUsers();
          }}
        />
      )}
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  onAction,
}: {
  user: UserRow;
  isSelf: boolean;
  onAction: (id: string, action: 'resend-invite' | 'reset-password' | 'terminate-sessions' | 'toggle-active' | 'delete', currentActive?: boolean) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <tr className="border-b border-glass-border/50 hover:bg-white/[0.02] transition">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} email={user.email} imageUrl={user.avatarUrl} size="md" />
          <div>
            <div className="text-sm text-ink font-medium">
              {user.name || user.email}
              {isSelf && <span className="ml-2 text-[10px] font-mono text-accent-bright">(you)</span>}
            </div>
            {user.name && <div className="text-xs text-ink-faint font-mono">{user.email}</div>}
          </div>
        </div>
      </td>
      <td className="p-4">
        <span className={roleBadge(user.role)}>{roleLabel(user.role)}</span>
      </td>
      <td className="p-4 text-sm text-ink-dim">
        {user.company ? user.company.name : <span className="text-ink-faint italic">Perenne</span>}
      </td>
      <td className="p-4">
        <span className={statusBadge(user.status)}>{statusLabel(user.status)}</span>
      </td>
      <td className="p-4 text-right relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-2 rounded-xl hover:bg-white/[0.06] transition text-ink-dim"
          aria-label="Actions"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-4 top-12 z-20 w-56 py-1.5 rounded-2xl bg-zinc-900/95 backdrop-blur border border-glass-border shadow-2xl">
              {user.status === 'pending' && (
                <button onClick={() => { onAction(user.id, 'resend-invite'); setShowMenu(false); }} className={menuItem}>
                  Resend invite
                </button>
              )}
              {user.status !== 'pending' && (
                <button onClick={() => { onAction(user.id, 'reset-password'); setShowMenu(false); }} className={menuItem}>
                  Send password reset
                </button>
              )}
              {user.status === 'active' && (
                <button onClick={() => { onAction(user.id, 'terminate-sessions'); setShowMenu(false); }} className={menuItem}>
                  Sign out everywhere
                </button>
              )}
              {!isSelf && user.status !== 'pending' && (
                <button
                  onClick={() => { onAction(user.id, 'toggle-active', user.status === 'active'); setShowMenu(false); }}
                  className={menuItem}
                >
                  {user.status === 'active' ? 'Disable account' : 'Enable account'}
                </button>
              )}
              {!isSelf && (
                <>
                  <div className="my-1 border-t border-glass-border/50" />
                  <button onClick={() => { onAction(user.id, 'delete'); setShowMenu(false); }} className={menuItemDanger}>
                    Delete user
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </td>
    </tr>
  );
}

function InviteModal({
  mode,
  companies,
  onClose,
  onSuccess,
}: {
  mode: 'team' | 'company';
  companies: CompanySummary[];
  onClose: () => void;
  onSuccess: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'OWNER' | 'ADMIN' | 'VIEWER' | 'SUPERADMIN'>(mode === 'team' ? 'SUPERADMIN' : 'OWNER');
  const [companyId, setCompanyId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        email: email.trim(),
        name: name.trim() || undefined,
        role,
      };
      if (mode === 'company') body.companyId = companyId;

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invite failed');
      onSuccess(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md p-8 rounded-3xl bg-zinc-900/95 border border-glass-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6">
          <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-1">
            {mode === 'team' ? 'Perenne team' : 'Customer company'}
          </div>
          <h2 className="font-display italic text-2xl text-ink">
            {mode === 'team' ? 'Invite a Perenne team member' : 'Invite a user to a company'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] text-ink-dim font-medium mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              disabled={submitting}
              placeholder="user@example.com"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] text-ink-dim font-medium mb-1.5">Name <span className="text-ink-faint">(optional)</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              placeholder="Full name"
              className={inputClass}
            />
          </div>

          {mode === 'company' && (
            <>
              <div>
                <label className="block text-[11px] text-ink-dim font-medium mb-1.5">Company</label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  required
                  disabled={submitting}
                  className={inputClass}
                >
                  <option value="">Select a company…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-ink-dim font-medium mb-1.5">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                  disabled={submitting}
                  className={inputClass}
                >
                  <option value="OWNER">Owner — full access</option>
                  <option value="ADMIN">Admin — manage codes & distribution</option>
                  <option value="VIEWER">Viewer — read-only</option>
                </select>
              </div>
            </>
          )}

          {error && (
            <div className="py-2.5 px-4 rounded-2xl text-[11px] font-mono border bg-red-400/5 border-red-400/20 text-red-200 text-center">
              ⊘ {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-5 py-3 rounded-2xl border border-glass-border bg-white/[0.04] text-ink text-sm hover:bg-white/[0.08] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !email.trim() || (mode === 'company' && !companyId)}
              className="flex-1 px-5 py-3 rounded-2xl bg-accent text-white text-sm font-medium hover:bg-accent-bright transition shadow-lg shadow-accent/20 disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Send invite →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────

const inputClass = 'w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-glass-border text-ink text-sm placeholder-ink-faint focus:outline-none focus:border-accent/50 focus:bg-white/[0.06] transition disabled:opacity-50';
const selectClass = 'px-3 py-2 rounded-xl bg-white/[0.04] border border-glass-border text-ink text-sm focus:outline-none focus:border-accent/50';
const menuItem = 'block w-full text-left px-4 py-2 text-sm text-ink hover:bg-white/[0.06] transition';
const menuItemDanger = 'block w-full text-left px-4 py-2 text-sm text-red-300 hover:bg-red-500/10 transition';

function roleLabel(role: string): string {
  return { SUPERADMIN: 'Perenne team', OWNER: 'Owner', ADMIN: 'Admin', VIEWER: 'Viewer' }[role] || role;
}

function roleBadge(role: string): string {
  const base = 'inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider';
  const colors: Record<string, string> = {
    SUPERADMIN: 'bg-violet-500/15 text-violet-200 border border-violet-500/25',
    OWNER: 'bg-accent/15 text-accent-bright border border-accent/25',
    ADMIN: 'bg-blue-500/15 text-blue-200 border border-blue-500/25',
    VIEWER: 'bg-zinc-500/15 text-zinc-200 border border-zinc-500/25',
  };
  return `${base} ${colors[role] || colors.VIEWER}`;
}

function statusLabel(status: string): string {
  return { active: 'Active', pending: 'Pending', locked: 'Locked' }[status] || status;
}

function statusBadge(status: string): string {
  const base = 'inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider';
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/25',
    pending: 'bg-yellow-500/15 text-yellow-200 border border-yellow-500/25',
    locked: 'bg-red-500/15 text-red-200 border border-red-500/25',
  };
  return `${base} ${colors[status] || colors.locked}`;
}
