import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma client optimized for serverless cold start.
 * v32: explicit log filtering, single global instance.
 */
export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
