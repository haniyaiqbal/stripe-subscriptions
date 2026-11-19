/**
 * The plans this app sells. Prices live in Stripe and are found by their
 * `lookup_key`, so the code never hard-codes Stripe price IDs.
 * `npm run stripe:setup` creates them in your Stripe test account.
 */
export const PAID_PLANS = {
  pro_monthly: {
    name: 'Pro (monthly)',
    amount: 900, // in cents: $9.00
    currency: 'usd',
    interval: 'month',
  },
  pro_yearly: {
    name: 'Pro (yearly)',
    amount: 9000, // $90.00: two months free
    currency: 'usd',
    interval: 'year',
  },
} as const;

export type PaidPlanKey = keyof typeof PAID_PLANS;
export const PAID_PLAN_KEYS = Object.keys(PAID_PLANS) as PaidPlanKey[];

export function isPaidPlanKey(value: unknown): value is PaidPlanKey {
  return typeof value === 'string' && value in PAID_PLANS;
}

/** What a user on each tier can do. */
export const FREE_PROJECT_LIMIT = 3;

/**
 * Subscription statuses that still give Pro access.
 * `past_due` is included on purpose: Stripe is retrying the card, and
 * locking someone out over a failed retry would be harsh. If every retry
 * fails, Stripe moves the subscription to `canceled` or `unpaid`.
 */
const ACCESS_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function grantsAccess(status: string | null | undefined): boolean {
  return status != null && ACCESS_STATUSES.has(status);
}

/** Monthly value of a plan, for the admin revenue number. */
export function monthlyAmount(plan: PaidPlanKey): number {
  const { amount, interval } = PAID_PLANS[plan];
  return interval === 'year' ? Math.round(amount / 12) : amount;
}
