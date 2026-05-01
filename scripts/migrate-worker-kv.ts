/**
 * One-shot migration: import codes from the Cloudflare Worker KV
 * (PERENNE_TEAMS) into Postgres LegacyTeamCode rows.
 *
 * Run BEFORE the DNS swap (i.e. while the Worker is still alive on
 * api.perenne.app) so we can read the KV via the admin endpoints.
 *
 *   npx tsx scripts/migrate-worker-kv.ts --dry-run
 *   npx tsx scripts/migrate-worker-kv.ts
 *
 * Required env:
 *   WORKER_BASE_URL    https://api.perenne.app
 *   WORKER_ADMIN_USER  admin
 *   WORKER_ADMIN_PASS  PerenneB2B2026!  (or whatever you set)
 *
 * Idempotent: skips codes that already exist in LegacyTeamCode.
 * Codes that collide with a Stripe NotebookCode are skipped + logged
 * (extremely unlikely — formats differ — but defensive).
 */

import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const WORKER = process.env.WORKER_BASE_URL ?? 'https://api.perenne.app';
const USER = process.env.WORKER_ADMIN_USER ?? 'admin';
const PASS = process.env.WORKER_ADMIN_PASS ?? '';

if (!PASS) {
  console.error('✗ WORKER_ADMIN_PASS not set in env');
  process.exit(1);
}

interface WorkerTeam {
  code: string;
  company?: string;
  logoURL?: string | null;
  logoExtendedURL?: string | null;
  logoWhiteURL?: string | null;
  colors?: { primary?: string; secondary?: string } | null;
  quote?: string | null;
  seats?: number | null;
  expires?: string | null;
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Worker KV → Postgres legacy migration ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(60));

  // ─── Fetch list from Worker /admin/teams ──────────────────────
  const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
  const listRes = await fetch(`${WORKER}/admin/teams`, {
    headers: { Authorization: auth },
  });
  if (!listRes.ok) {
    console.error(`✗ Worker /admin/teams returned ${listRes.status}`);
    const t = await listRes.text().catch(() => '');
    console.error(`  body: ${t.slice(0, 300)}`);
    process.exit(1);
  }
  const teams = (await listRes.json()) as WorkerTeam[];
  console.log(`\nFound ${teams.length} codes in Worker KV.\n`);

  let imported = 0;
  let skipped = 0;
  let collisions = 0;

  for (const t of teams) {
    const code = String(t.code).trim().toUpperCase();
    if (!code) {
      console.log(`  ⚠ skipping entry with empty code`);
      continue;
    }

    // Skip if already present in LegacyTeamCode (idempotent)
    const existing = await prisma.legacyTeamCode.findUnique({ where: { code } });
    if (existing) {
      console.log(`  · ${code}: already in DB, skipping`);
      skipped += 1;
      continue;
    }

    // Skip + warn if a Stripe NotebookCode happens to use the same string
    const collision = await prisma.notebookCode.findUnique({ where: { code } });
    if (collision) {
      console.log(`  ⚠ ${code}: COLLIDES with NotebookCode, skipping`);
      collisions += 1;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] would import ${code} — ${t.company ?? '(no company)'}`);
      imported += 1;
      continue;
    }

    await prisma.legacyTeamCode.create({
      data: {
        code,
        label: t.company ? `Imported from KV — ${t.company}` : 'Imported from KV',
        manualCompanyName: t.company ?? null,
        manualLogoUrl: t.logoURL ?? null,
        manualLogoExtUrl: t.logoExtendedURL ?? null,
        manualLogoWhiteUrl: t.logoWhiteURL ?? null,
        manualPrimaryColor: t.colors?.primary ?? null,
        manualQuote: t.quote ?? null,
        seats: t.seats ?? null,
        expiresAt: t.expires ? new Date(t.expires) : null,
        isActive: true,
        createdByEmail: 'kv-migration@system',
      },
    });
    imported += 1;
    console.log(`  ✓ ${code} — ${t.company ?? '(no company)'}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log(`  Found in KV:           ${teams.length}`);
  console.log(`  Imported:              ${imported}`);
  console.log(`  Skipped (already in):  ${skipped}`);
  console.log(`  Collisions (NotebookCode): ${collisions}`);
  if (DRY_RUN) console.log(`  >> DRY RUN — no writes <<`);
  console.log('='.repeat(60) + '\n');

  // Suppress unused-var TS warning if Prisma type drift occurs
  const _ignored: Prisma.LegacyTeamCodeCreateArgs | undefined = undefined;
  void _ignored;
}

main()
  .catch((err) => {
    console.error('\n✗ Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
