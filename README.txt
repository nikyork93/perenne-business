═══════════════════════════════════════════════════════════════════
ARCHIVE 2 — Users Management (Step 2 of full development)
═══════════════════════════════════════════════════════════════════

## Files in this archive (12 total)

components/ui/Avatar.tsx                                 NEW
lib/email-templates.ts                                   UPDATED (adds teamMemberInviteEmail)
app/admin/users/page.tsx                                 NEW
app/admin/users/UsersListClient.tsx                      NEW
app/team/page.tsx                                        NEW
app/team/TeamListClient.tsx                              NEW
app/api/admin/users/route.ts                             NEW
app/api/admin/users/[id]/route.ts                        NEW
app/api/admin/users/[id]/resend-invite/route.ts          NEW
app/api/admin/users/[id]/reset-password/route.ts         NEW
app/api/admin/users/[id]/sessions/route.ts               NEW
app/api/team/route.ts                                    NEW
app/api/team/[id]/route.ts                               NEW
SHELL_NAV_UPDATE.txt                                     READ — manual changes to Shell.tsx

## What this delivers

SUPERADMIN — /admin/users
  - Cross-company users list with filters: search, role, company, status
  - Invite Perenne team members (SUPERADMIN role, no company)
  - Invite users to any specific company with any role
  - Per-user actions: resend invite / send password reset / sign-out everywhere /
                       disable / enable / delete

OWNER & ADMIN — /team
  - Their company's team only (cannot see other companies)
  - Invite member to their company (OWNER can invite OWNER/ADMIN/VIEWER,
    ADMIN can invite ADMIN/VIEWER, no SUPERADMIN ever from this scope)
  - Per-user actions: resend invite / send password reset / sign-out everywhere /
                       disable / enable / remove

VIEWER — /team
  - Read-only access to the list, no invite/manage actions

## Deploy

cd ~/Dropbox/Documenti/perenne-business && \
tar -xzf ~/Downloads/perenne-users.tar.gz && \
cat SHELL_NAV_UPDATE.txt

Then manually update components/layout/Shell.tsx based on the
SHELL_NAV_UPDATE.txt instructions (add 2 nav links).

Then:

git add -A && \
git commit -m "feat: users management (admin cross-company + team scoped)" && \
git push && \
rm ~/Downloads/perenne-users.tar.gz

No schema changes are needed — uses existing User/Company/Session models.

## Test sequence after deploy

1. Login as SUPERADMIN at https://business.perenne.app/login
2. Navigate to /admin/users (or click "Users" in sidebar if you added it)
3. See yourself listed as Perenne team member
4. Click "+ Invite to a company" → pick Stelvio Collection (if you have one)
   → select Owner role → enter another email → Send invite
5. Receive email at the invited address with Perenne branding
6. Click invite link → set password → land in /dashboard as OWNER of that company
7. As that OWNER, navigate to /team
8. Click "+ Invite member" → invite an ADMIN → Send
9. The new admin sets up password and lands in dashboard
10. Test other actions: send password reset, sign out everywhere, disable, etc.

## Authorization matrix

                          SUPERADMIN  OWNER       ADMIN       VIEWER
View /admin/users         ✓           ✗           ✗           ✗
View /team                ✗ (no co.)  ✓           ✓           ✓
Invite SUPERADMIN         ✓           ✗           ✗           ✗
Invite to any company     ✓           ✗           ✗           ✗
Invite OWNER (own co.)    ✓           ✓           ✗           ✗
Invite ADMIN (own co.)    ✓           ✓           ✓           ✗
Invite VIEWER (own co.)   ✓           ✓           ✓           ✗
Manage SUPERADMIN         ✓           ✗           ✗           ✗
Manage OWNER (own co.)    ✓           ✓           ✗           ✗
Manage ADMIN (own co.)    ✓           ✓           ✓           ✗
Manage VIEWER (own co.)   ✓           ✓           ✓           ✗
Manage self               ✓ (limited) ✓ (limited) ✓ (limited) ✗

Note: nobody can deactivate themselves or change their own role.

═══════════════════════════════════════════════════════════════════
