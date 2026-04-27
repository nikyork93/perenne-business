import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const superadminEmail = process.env.SUPERADMIN_EMAIL;
  if (!superadminEmail) {
    throw new Error('SUPERADMIN_EMAIL env var is required');
  }

  const existing = await prisma.user.findUnique({ where: { email: superadminEmail } });
  if (existing) {
    console.log(`✓ Superadmin already exists: ${superadminEmail}`);
    if (existing.role !== UserRole.SUPERADMIN) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: UserRole.SUPERADMIN },
      });
      console.log(`  → elevated to SUPERADMIN`);
    }
    return;
  }

  await prisma.user.create({
    data: {
      email: superadminEmail,
      name: 'Perenne Team',
      role: UserRole.SUPERADMIN,
      companyId: null,
    },
  });
  console.log(`✓ Superadmin created: ${superadminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
