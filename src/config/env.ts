import { z } from 'zod';

/**
 * Every environment variable the app reads. It refuses to start if one is
 * missing or wrong, so a bad deploy fails loudly instead of half-working.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters long'),
  /** Where this API is reachable. Stripe sends people back here after paying. */
  APP_URL: z.url(),
  STRIPE_SECRET_KEY: z
    .string()
    .startsWith(
      'sk_',
      'STRIPE_SECRET_KEY must be a Stripe secret key (sk_...)',
    ),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .startsWith('whsec_', 'STRIPE_WEBHOOK_SECRET must start with whsec_'),
  /** Comma-separated emails that become admins when they sign up. */
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;
