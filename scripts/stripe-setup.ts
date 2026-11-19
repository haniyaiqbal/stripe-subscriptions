/**
 * Creates the "Pro" product and its prices in your Stripe account.
 * Safe to run more than once: prices that already exist are left alone.
 *
 *   npm run stripe:setup
 *
 * Use a TEST mode key (sk_test_...). The app finds these prices by their
 * lookup key, so there are no price IDs to copy anywhere.
 */
import Stripe from 'stripe';
import { PAID_PLANS, PAID_PLAN_KEYS } from '../src/billing/plans.js';

const key = process.env.STRIPE_SECRET_KEY;
if (!key?.startsWith('sk_test_')) {
  console.error('Set STRIPE_SECRET_KEY to a test mode key (sk_test_...).');
  process.exit(1);
}
const stripe = new Stripe(key);

const existing = await stripe.prices.list({ lookup_keys: PAID_PLAN_KEYS });
const found = new Set(existing.data.map((price) => price.lookup_key));
const missing = PAID_PLAN_KEYS.filter((plan) => !found.has(plan));

if (missing.length === 0) {
  console.log('All prices already exist:');
} else {
  const product =
    existing.data[0]?.product ??
    (
      await stripe.products.create({
        name: 'Pro',
        description: 'Unlimited projects and CSV export',
      })
    ).id;

  for (const plan of missing) {
    const { amount, currency, interval, name } = PAID_PLANS[plan];
    await stripe.prices.create({
      product: typeof product === 'string' ? product : product.id,
      unit_amount: amount,
      currency,
      recurring: { interval },
      lookup_key: plan,
      nickname: name,
    });
    console.log(`Created price ${plan}`);
  }
}

const prices = await stripe.prices.list({ lookup_keys: PAID_PLAN_KEYS });
for (const price of prices.data) {
  console.log(
    `  ${price.lookup_key}: ${price.unit_amount! / 100} ${price.currency} / ${price.recurring?.interval} (${price.id})`,
  );
}
