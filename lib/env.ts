import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),

  // Auth
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 chars'),
  NEXT_PUBLIC_APP_URL: z.string().url(),

  // Email
  RESEND_API_KEY: z.string().startsWith('re_').optional(),
  EMAIL_FROM: z.string().default('Perenne Business <business@perenne.app>'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),

  // Worker
  PERENNE_API_URL: z.string().url().default('https://api.perenne.app'),
  PERENNE_API_SECRET: z.string().optional(),

  // Super-admin
  SUPERADMIN_EMAIL: z.string().email(),
});

/**
 * Parsed & validated env. Import this instead of process.env for type safety.
 * Throws a clear error at build time / boot time if something is missing.
 */
export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
