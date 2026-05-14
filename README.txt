Perenne Business — Full deploy bundle (Batches C + D + E)
============================================================

How to apply:

  1) Drop this whole bundle into your repo, e.g.:

       cd ~/Dropbox/Documenti/perenne-business
       unzip -o ~/Downloads/portal_full_deploy.zip
       cp -R portal_full_deploy/. .
       rm -rf portal_full_deploy

  2) Run the setup script (does everything else):

       bash _setup/setup.sh

That single command:
  • Installs `jose` npm package
  • Patches prisma/schema.prisma (adds AdminSettings + AnalyticsSnapshot)
  • Runs the two SQL migrations against your live Neon DB
  • Regenerates the Prisma client
  • Git add + commit + push (Vercel auto-deploys)

Safe to re-run if anything fails — the migrations are idempotent
and the schema patcher detects existing definitions.

Files in this bundle:

  _setup/
    setup.sh             — main script
    apply-schema.py      — schema patcher (called by setup.sh)
  prisma/migrations/
    manual_order_flow.sql       — Batch D: Order model fields + enum values + AdminSettings
    analytics_integration.sql   — Batch E: AdminSettings analytics fields + AnalyticsSnapshot
  app/, components/, lib/    — all the code changes

After Vercel finishes deploying:
  • /admin/settings — fill in bank details, App Store Connect creds, Firebase JSON
  • /admin/orders   — review/approve incoming orders
  • /admin/analytics — see installs, revenue, DAU charts
