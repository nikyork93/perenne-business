'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserRole } from '@prisma/client';
import { GlassPanel, Button, Input, Select, Badge, Whisper, SectionLabel } from '@/components/ui';

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  lastLoginAt: string | null;
  invitedByEmail: string | null;
  invitedAt: string | null;
  createdAt: string;
}

interface Props {
  members: Member[];
  currentUserId: string;
  canManage: boolean;
}

const ROLE_TONE: Record<UserRole, 'accent' | 'info' | 'neutral' | 'danger'> = {
  OWNER: 'accent',
  ADMIN: 'info',
  VIEWER: 'neutral',
  SUPERADMIN: 'danger',
};

export function TeamClient({ members, currentUserId, canManage }: Props) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'VIEWER'>('ADMIN');
  const [inviteName, setInviteName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setFlash(null);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          name: inviteName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlash({ type: 'err', msg: data.error ?? 'Invitation failed.' });
        return;
      }
      setFlash({ type: 'ok', msg: data.message ?? 'Invitation sent.' });
      setInviteEmail('');
      setInviteName('');
      router.refresh();
    } catch {
      setFlash({ type: 'err', msg: 'Network error.' });
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, newRole: UserRole) {
    if (newRole === 'OWNER' && !confirm('Transfer ownership? You will be demoted to ADMIN.')) {
      return;
    }
    setBusyId(memberId);
    try {
      const res = await fetch(`/api/team/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlash({ type: 'err', msg: data.error ?? 'Update failed.' });
        return;
      }
      setFlash({ type: 'ok', msg: 'Role updated.' });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(memberId: string, email: string) {
    if (!confirm(`Remove ${email} from the team? This cannot be undone.`)) return;
    setBusyId(memberId);
    try {
      const res = await fetch(`/api/team/${memberId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setFlash({ type: 'err', msg: data.error ?? 'Remove failed.' });
        return;
      }
      setFlash({ type: 'ok', msg: 'Member removed.' });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {flash && (
        <div
          className={`mb-4 py-2.5 px-4 rounded-lg text-[11px] font-mono border ${
            flash.type === 'ok'
              ? 'bg-emerald-400/5 border-emerald-400/20 text-emerald-300'
              : 'bg-danger/5 border-danger/20 text-[#ff9a9a]'
          }`}
        >
          {flash.type === 'ok' ? '✓ ' : '✕ '}
          {flash.msg}
        </div>
      )}

      {/* Invite form */}
      {canManage && (
        <GlassPanel animate padding="lg" className="mb-6">
          <SectionLabel>Invite a team member</SectionLabel>
          <form onSubmit={handleInvite} className="mt-4 grid grid-cols-1 md:grid-cols-[2fr_1fr_1.5fr_auto] gap-3 items-end">
            <Input
              label="Email"
              type="email"
              placeholder="hr@acme.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
            <Select
              label="Role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'ADMIN' | 'VIEWER')}
            >
              <option value="ADMIN">Admin</option>
              <option value="VIEWER">Viewer</option>
            </Select>
            <Input
              label="Name (optional)"
              placeholder="Jane Doe"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
            />
            <Button type="submit" variant="primary" loading={inviting} disabled={!inviteEmail || inviting}>
              Send invite
            </Button>
          </form>
          <p className="mt-3 text-[11px] text-ink-faint">
            <strong>Admin</strong> can manage codes, distribution, and the cover editor.{' '}
            <strong>Viewer</strong> has read-only access.
          </p>
        </GlassPanel>
      )}

      {/* Members list */}
      <SectionLabel className="px-1">Team members ({members.length})</SectionLabel>
      <GlassPanel padding="none" className="overflow-hidden">
        {members.length === 0 ? (
          <div className="p-10"><Whisper>No members yet.</Whisper></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="text-left label px-4 py-3">Member</th>
                  <th className="text-left label px-4 py-3">Role</th>
                  <th className="text-left label px-4 py-3">Last login</th>
                  <th className="text-left label px-4 py-3">Joined</th>
                  {canManage && <th className="text-right label px-4 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isSelf = m.id === currentUserId;
                  const isOwner = m.role === 'OWNER';
                  return (
                    <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {m.name ?? '—'} {isSelf && <span className="text-ink-faint text-[10px]">(you)</span>}
                        </div>
                        <div className="text-[10px] text-ink-faint font-mono">{m.email}</div>
                        {m.invitedByEmail && (
                          <div className="text-[10px] text-ink-faint mt-0.5">
                            invited by {m.invitedByEmail}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={ROLE_TONE[m.role]}>{m.role.toLowerCase()}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ink-dim">
                        {m.lastLoginAt
                          ? new Date(m.lastLoginAt).toLocaleDateString()
                          : <span className="text-ink-faint">never</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ink-dim">
                        {new Date(m.createdAt).toLocaleDateString()}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          {!isSelf && !isOwner && (
                            <div className="inline-flex gap-1.5">
                              {m.role !== 'ADMIN' && (
                                <button
                                  type="button"
                                  onClick={() => handleRoleChange(m.id, 'ADMIN')}
                                  disabled={busyId === m.id}
                                  className="text-[11px] px-2 py-1 rounded border border-glass-border hover:border-ink-dim text-ink-dim hover:text-ink transition"
                                >
                                  Make admin
                                </button>
                              )}
                              {m.role !== 'VIEWER' && (
                                <button
                                  type="button"
                                  onClick={() => handleRoleChange(m.id, 'VIEWER')}
                                  disabled={busyId === m.id}
                                  className="text-[11px] px-2 py-1 rounded border border-glass-border hover:border-ink-dim text-ink-dim hover:text-ink transition"
                                >
                                  Make viewer
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemove(m.id, m.email)}
                                disabled={busyId === m.id}
                                className="text-[11px] px-2 py-1 rounded border border-danger/30 hover:border-danger/60 text-[#ff9a9a] hover:text-danger transition"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                          {isSelf && <span className="text-[10px] text-ink-faint">—</span>}
                          {!isSelf && isOwner && (
                            <span className="text-[10px] text-ink-faint">owner</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </>
  );
}
