import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { StripeService } from '../src/billing/stripe.service.js';
import type { PaidPlanKey } from '../src/billing/plans.js';

/**
 * Stands in for Stripe in tests: no network, no account needed. It keeps
 * subscriptions in memory, and webhook signatures are still checked by the
 * real Stripe library (inherited `constructEvent`).
 */
export class FakeStripeService extends StripeService {
  readonly subscriptions = new Map<string, Stripe.Subscription>();
  readonly checkoutCalls: {
    userId: string;
    plan: PaidPlanKey;
    idempotencyKey?: string;
  }[] = [];

  override async createCustomer(userId: string): Promise<string> {
    return `cus_test_${userId.slice(0, 8)}`;
  }

  override async createCheckoutSession(params: {
    userId: string;
    plan: PaidPlanKey;
    idempotencyKey?: string;
  }): Promise<string> {
    this.checkoutCalls.push(params);
    return `https://checkout.stripe.test/c/${params.plan}`;
  }

  override async createPortalSession(customerId: string): Promise<string> {
    return `https://billing.stripe.test/p/${customerId}`;
  }

  override async retrieveSubscription(
    id: string,
  ): Promise<Stripe.Subscription> {
    const sub = this.subscriptions.get(id);
    if (!sub) throw new Error(`No such subscription: ${id}`);
    return sub;
  }

  override async setCancelAtPeriodEnd(id: string, cancel: boolean) {
    const sub = await this.retrieveSubscription(id);
    const updated = { ...sub, cancel_at_period_end: cancel };
    this.subscriptions.set(id, updated);
    return updated as Stripe.Response<Stripe.Subscription>;
  }

  /** Simulates Stripe creating or changing a subscription. */
  putSubscription(opts: {
    id?: string;
    userId: string;
    customerId: string;
    plan: PaidPlanKey;
    status: Stripe.Subscription.Status;
  }): Stripe.Subscription {
    const id = opts.id ?? `sub_test_${randomUUID()}`;
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    const sub = {
      id,
      object: 'subscription',
      customer: opts.customerId,
      status: opts.status,
      cancel_at_period_end: false,
      metadata: { userId: opts.userId },
      items: {
        object: 'list',
        data: [
          {
            id: `si_${id}`,
            current_period_end: periodEnd,
            price: { id: `price_${opts.plan}`, lookup_key: opts.plan },
          },
        ],
      },
    } as unknown as Stripe.Subscription;
    this.subscriptions.set(id, sub);
    return sub;
  }
}
