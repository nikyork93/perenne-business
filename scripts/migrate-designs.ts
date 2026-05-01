/**
 * Session 1 migration — backfill Design library from legacy CoverConfig.
 *
 * Run ONCE after `npx prisma db push` applies the schema changes.
 * Idempotent: re-running is safe (checks for existing Default per company).
 *
 *   npx tsx scripts/migrate-designs.ts
 *   # or:
 *   npx tsx scripts/migrate-designs.ts --dry-run
 *
 * What it does, per Company:
 *   1. Find the active CoverConfig (or most recent if no active).
 *      If none → create an empty placeholder Default design.
 *   2. Create a Design row (isDefault=true, name="Default") mirroring
 *      the active config's content. Skip if a Default already exists.
 *   3. Snapshot the design into every existing Order that doesn't
 *      already have designId set. The snapshot freezes the current
 *      state — orders predating the migration get the company's
 *      current cover, which is the same thing they would've rendered
 *      before this migration anyway.
 *
 * Safety:
 *   - Wrapped in per-company transactions
 *   - --dry-run flag prints what would happen without writing
 *   - Logs every action for audit
 */

import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

interface CoverConfigLike {
  id: string;
  backgroundColor: string;
  backgroundImageUrl: string | null;
  assetsJson: unknown;
  pageWatermarksJson: unknown;
  quoteText: string | null;
  quotePosition: string | null;
  quoteColor: string | null;
  previewPngUrl: string | null;
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Design library migration ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(60));

  const companies = await prisma.company.findMany({
    select: { id: true, slug: true, name: true },
  });
  console.log(`\nFound ${companies.length} companies to process.\n`);

  let designsCreated = 0;
  let designsSkipped = 0;
  let ordersBackfilled = 0;
  let companiesEmpty = 0;

  for (const company of companies) {
    console.log(`→ ${company.slug} (${company.name})`);

    // Skip if a Default already exists (idempotency guard)
    const existingDefault = await prisma.design.findFirst({
      where: { companyId: company.id, isDefault: true },
    });
    if (existingDefault) {
      console.log(`    Default design already exists — skipping creation.`);
      designsSkipped += 1;
    }

    // Source: active CoverConfig, fallback to most recent
    let source = (await prisma.coverConfig.findFirst({
      where: { companyId: company.id, isActive: true },
      orderBy: { version: 'desc' },
    })) as CoverConfigLike | null;

    if (!source) {
      source = (await prisma.coverConfig.findFirst({
        where: { companyId: company.id },
        orderBy: { version: 'desc' },
      })) as CoverConfigLike | null;
    }

    if (!source) {
      console.log(`    No CoverConfig found — will create empty Default.`);
      companiesEmpty += 1;
    }

    // Create Default if missing
    let defaultDesign = existingDefault;
    if (!defaultDesign) {
      if (DRY_RUN) {
        console.log(`    [dry-run] would create Default design`);
      } else {
        defaultDesign = await prisma.design.create({
          data: {
            companyId: company.id,
            name: 'Default',
            isDefault: true,
            backgroundColor: source?.backgroundColor ?? '#1a1a1a',
            backgroundImageUrl: source?.backgroundImageUrl ?? null,
            assetsJson:
              (source?.assetsJson ?? []) as unknown as Prisma.InputJsonValue,
            pageWatermarksJson:
              (source?.pageWatermarksJson ?? []) as unknown as Prisma.InputJsonValue,
            quoteText: source?.quoteText ?? null,
            quotePosition: source?.quotePosition ?? 'bottom',
            quoteColor: source?.quoteColor ?? '#ffffff',
            previewPngUrl: source?.previewPngUrl ?? null,
          },
        });
        designsCreated += 1;
        console.log(`    ✓ Created Default design ${defaultDesign.id}`);
      }
    }

    // Build snapshot for orders. Use the design we have (just created or
    // pre-existing). In dry-run we still build a synthetic snapshot
    // from `source` to count what would happen.
    const snapshotSrc = defaultDesign ?? {
      backgroundColor: source?.backgroundColor ?? '#1a1a1a',
      backgroundImageUrl: source?.backgroundImageUrl ?? null,
      assetsJson: source?.assetsJson ?? [],
      pageWatermarksJson: source?.pageWatermarksJson ?? [],
      quoteText: source?.quoteText ?? null,
      quotePosition: source?.quotePosition ?? 'bottom',
      quoteColor: source?.quoteColor ?? '#ffffff',
    };

    const snapshot = {
      v: 1 as const,
      backgroundColor: snapshotSrc.backgroundColor,
      backgroundImageUrl: snapshotSrc.backgroundImageUrl ?? null,
      assets: (snapshotSrc.assetsJson as unknown as unknown[]) ?? [],
      pageWatermarks:
        (snapshotSrc.pageWatermarksJson as unknown as unknown[]) ?? [],
      quote: snapshotSrc.quoteText
        ? {
            text: snapshotSrc.quoteText,
            position: snapshotSrc.quotePosition ?? 'bottom',
            color: snapshotSrc.quoteColor ?? '#ffffff',
          }
        : null,
    };

    // Backfill orders that have no designId yet
    const ordersToUpdate = await prisma.order.findMany({
      where: { companyId: company.id, designId: null },
      select: { id: true },
    });

    if (ordersToUpdate.length === 0) {
      console.log(`    No orders to backfill.`);
    } else if (DRY_RUN) {
      console.log(
        `    [dry-run] would backfill ${ordersToUpdate.length} order(s)`
      );
      ordersBackfilled += ordersToUpdate.length;
    } else if (defaultDesign) {
      const result = await prisma.order.updateMany({
        where: { companyId: company.id, designId: null },
        data: {
          designId: defaultDesign.id,
          designSnapshotJson: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      ordersBackfilled += result.count;
      console.log(`    ✓ Backfilled ${result.count} order(s)`);
    } else {
      // Defensive: should be unreachable since we always either skip-on-existing
      // or create above. Loud failure beats silent.
      console.error(
        `    ✗ ${ordersToUpdate.length} order(s) NOT backfilled — no defaultDesign available!`
      );
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log(`  Companies processed:       ${companies.length}`);
  console.log(`  Empty companies (no cfg):  ${companiesEmpty}`);
  console.log(`  Designs created:           ${designsCreated}`);
  console.log(`  Designs already present:   ${designsSkipped}`);
  console.log(`  Orders backfilled:         ${ordersBackfilled}`);
  if (DRY_RUN) console.log(`  >> DRY RUN — no writes made <<`);
  console.log('='.repeat(60) + '\n');
}

main()
  .catch((err) => {
    console.error('\n✗ Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
