## ARCHIVE 1 — Auth foundation (password-only)

### Files in this archive

```
prisma/SCHEMA_UPDATE.txt          ← READ THIS, manually paste fields into your schema.prisma
lib/auth.ts                        ← bcrypt + session + invite + reset
lib/email-templates.ts             ← Perenne Note SVG inline + glass design
middleware.ts                      ← public paths updated
app/login/page.tsx                 ← email + password login
app/invite/page.tsx                ← first-time setup (set password)
app/forgot-password/page.tsx       ← request reset link
app/reset-password/page.tsx        ← set new password
app/api/auth/login/route.ts
app/api/auth/accept-invite/route.ts
app/api/auth/forgot-password/route.ts
app/api/auth/reset-password/route.ts
app/api/admin/companies/route.ts   ← updated to use invite tokens (was magic link)
```

### Deploy steps (in order)

1. Extract archive into perenne-business root
2. Update prisma/schema.prisma — open SCHEMA_UPDATE.txt and paste the new fields into your User model
3. `npm install bcryptjs --legacy-peer-deps`
4. `npm install -D @types/bcryptjs --legacy-peer-deps`
5. `npx prisma db push` (will prompt for unique constraint warnings — answer Y)
6. `git add -A && git commit -m "feat: password auth + invite/reset flow"`
7. `git push`

### Test sequence after deploy

1. Open https://business.perenne.app/forgot-password
2. Enter your email (nicholascompagnoni@gmail.com)
3. Check inbox — you'll receive Perenne-branded email
4. Click reset link → set your password
5. Redirected to /login → sign in with email + password
6. Now go to /admin/companies → + New company → create Stelvio Collection with Nicholas Stelvio email
7. Nicholas receives Perenne-branded invite email
8. He clicks → sets his password → auto-logged in

### Rollback if anything breaks

The old magic link route /api/auth/verify is still preserved — you can roll back the deploy on Vercel.
