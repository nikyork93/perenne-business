'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import type { UserRole } from '@prisma/client';

interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  avatarUrl: string | null;
  status: 'active' | 'locked' | 'pending';
  inviteAcceptedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

interface TeamListClientProps {
  companyName: string;
  currentUserId: string;
  currentUserRole: UserRole;
}

export function TeamListClient({ companyName, currentUserId, currentUserRole }: TeamListClientProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const canInvite = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/team');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load team');
      setMembers(data.users);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  function flash(type: 'ok' | 'err', msg: string) {
    setActionMessage({ type, msg });
    setTimeout(() => setActionMessage(null), 4000);
  }

  async function handleAction(
    userId: string,
    action: 'resend-invite' | 'reset-password' | 'terminate-sessions' | 'toggle-active' | 'delete',
    currentActive?: boolean
  ) {
    if (action === 'delete') {
      if (!confirm('Permanently remove this team member? This cannot be undone.')) return;
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
        res = await fetch(`/api/team/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: !currentActive }),
        });
      } else {
        res = await fetch(`/api/team/${userId}`, { method: 'DELETE' });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Action failed');

      const messages = {
        'resend-invite': 'Invite email sent',
        'reset-password': 'Password reset email sent',
        'terminate-sessions': `Terminated ${data.terminated ?? 0} sessions`,
        'toggle-active': currentActive ? 'User disabled' : 'User enabled',
        'delete': 'Member removed',
      };
      flash('ok', messages[action]);
      await fetchTeam();
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Action failed');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-1">Team</div>
          <h1 className="font-display italic text-3xl text-ink">Team members</h1>
          <p className="text-sm text-ink-dim mt-1">Manage who has access to {companyName}</p>
        </div>
        {canInvite && (
          <button
            onClick={() => setShowInvite(true)}
            className="px-4 py-2 rounded-2xl bg-accent text-white text-sm hover:bg-accent-bright transition shadow-lg shadow-accent/20"
          >
            + Invite member
          </button>
        )}
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

      <div className="rounded-2xl bg-white/[0.02] border border-glass-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] font-mono text-ink-faint tracking-widest uppercase border-b border-glass-border">
              <th className="text-left p-4 font-medium">Member</th>
              <th className="text-left p-4 font-medium">Role</th>
              <th className="text-left p-4 font-medium">Status</th>
              <th className="text-right p-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="p-8 text-center text-ink-faint text-sm">Loading…</td></tr>}
            {!loading && members.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-ink-faint text-sm">No team members yet</td></tr>}
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                isSelf={m.id === currentUserId}
                currentUserRole={currentUserRole}
                onAction={handleAction}
              />
            ))}
          </tbody>
        </table>
      </div>

      {showInvite && (
        <InviteMemberModal
          currentUserRole={currentUserRole}
          onClose={() => setShowInvite(false)}
          onSuccess={async (email) => {
            setShowInvite(false);
            flash('ok', `Invite sent to ${email}`);
            await fetchTeam();
          }}
        />
      )}
    </div>
  );
}

function MemberRow({
  member,
  isSelf,
  currentUserRole,
  onAction,
}: {
  member: TeamMember;
  isSelf: boolean;
  currentUserRole: UserRole;
  onAction: (id: string, action: 'resend-invite' | 'reset-password' | 'terminate-sessions' | 'toggle-active' | 'delete', currentActive?: boolean) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const canManage = currentUserRole === 'OWNER' || (currentUserRole === 'ADMIN' && member.role !== 'OWNER');
  const showMenuButton = canManage || isSelf;

  return (
    <tr className="border-b border-glass-border/50 hover:bg-white/[0.02] transition">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <Avatar name={member.name} email={member.email} imageUrl={member.avatarUrl} size="md" />
          <div>
            <div className="text-sm text-ink font-medium">
              {member.name || member.email}
              {isSelf && <span className="ml-2 text-[10px] font-mono text-accent-bright">(you)</span>}
            </div>
            {member.name && <div className="text-xs text-ink-faint font-mono">{member.email}</div>}
          </div>
        </div>
      </td>
      <td className="p-4"><span className={roleBadge(member.role)}>{roleLabel(member.role)}</span></td>
      <td className="p-4"><span className={statusBadge(member.status)}>{statusLabel(member.status)}</span></td>
      <td className="p-4 text-right relative">
        {showMenuButton && (
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-xl hover:bg-white/[0.06] transition text-ink-dim"
            aria-label="Actions"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>
          </button>
        )}
        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-4 top-12 z-20 w-56 py-1.5 rounded-2xl bg-zinc-900/95 backdrop-blur border border-glass-border shadow-2xl">
              {canManage && member.status === 'pending' && (
                <button onClick={() => { onAction(member.id, 'resend-invite'); setShowMenu(false); }} className={menuItem}>Resend invite</button>
              )}
              {canManage && member.status !== 'pending' && (
                <button onClick={() => { onAction(member.id, 'reset-password'); setShowMenu(false); }} className={menuItem}>Send password reset</button>
              )}
              {canManage && member.status === 'active' && (
                <button onClick={() => { onAction(member.id, 'terminate-sessions'); setShowMenu(false); }} className={menuItem}>Sign out everywhere</button>
              )}
              {canManage && !isSelf && member.status !== 'pending' && (
                <button onClick={() => { onAction(member.id, 'toggle-active', member.status === 'active'); setShowMenu(false); }} className={menuItem}>
                  {member.status === 'active' ? 'Disable account' : 'Enable account'}
                </button>
              )}
              {canManage && !isSelf && (
                <>
                  <div className="my-1 border-t border-glass-border/50" />
                  <button onClick={() => { onAction(member.id, 'delete'); setShowMenu(false); }} className={menuItemDanger}>Remove from team</button>
                </>
              )}
            </div>
          </>
        )}
      </td>
    </tr>
  );
}

function InviteMemberModal({
  currentUserRole,
  onClose,
  onSuccess,
}: {
  currentUserRole: UserRole;
  onClose: () => void;
  onSuccess: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'OWNER' | 'ADMIN' | 'VIEWER'>('VIEWER');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined, role }),
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
          <div className="text-[10px] font-mono text-ink-faint tracking-widest uppercase mb-1">New team member</div>
          <h2 className="font-display italic text-2xl text-ink">Invite a member</h2>
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
              placeholder="member@yourcompany.com"
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

          <div>
            <label className="block text-[11px] text-ink-dim font-medium mb-1.5">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              disabled={submitting}
              className={inputClass}
            >
              {currentUserRole === 'OWNER' && <option value="OWNER">Owner — full access including billing</option>}
              <option value="ADMIN">Admin — manage codes & distribution</option>
              <option value="VIEWER">Viewer — read-only access</option>
            </select>
          </div>

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
              disabled={submitting || !email.trim()}
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

const inputClass = 'w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-glass-border text-ink text-sm placeholder-ink-faint focus:outline-none focus:border-accent/50 focus:bg-white/[0.06] transition disabled:opacity-50';
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
