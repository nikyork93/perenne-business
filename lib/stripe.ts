import Stripe from 'stripe';
import { env } from './env';

/**
 * Stripe server-side client.
 * Returns null if key is not configured (dev/local setup without Stripe yet).
 */
export const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia',
      typescript: true,
      appInfo: {
        name: 'Perenne Business',
        version: '1.0.0',
      },
    })
  : null;

/**
 * Throws if Stripe is not configured. Use in API routes that strictly need it.
 */
export function getStripe(): Stripe {
  if (!stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in env.');
  }
  return stripe;
}
