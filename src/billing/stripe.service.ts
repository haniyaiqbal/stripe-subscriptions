import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Env } from '../config/env.js';
import { PAID_PLAN_KEYS, type PaidPlanKey } from './plans.js';

/**
 * The only place that talks to Stripe. Keeping every call here makes the
 * rest of the app easy to test: tests swap this class for a fake.
 */
@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private priceIds?: Promise<Record<PaidPlanKey, string>>;

  constructor(config: ConfigService<Env, true>) {
    this.stripe = new Stripe(config.get('STRIPE_SECRET_KEY', { infer: true }), {
      maxNetworkRetries: 2,
    });
    this.webhookSecret = config.get('STRIPE_WEBHOOK_SECRET', { infer: true });
  }

  /**
   * Checks the `Stripe-Signature` header against the raw request body.
   * Throws if the body was changed or didn't come from Stripe.
   */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
  }

  /**
   * The idempotency key makes Stripe return the same customer if this is
   * retried, instead of creating a duplicate.
   */
  async createCustomer(userId: string, email: string): Promise<string> {
    const customer = await this.stripe.customers.create(
      { email, metadata: { userId } },
      { idempotencyKey: `customer:${userId}` },
    );
    return customer.id;
  }

  async createCheckoutSession(params: {
    userId: string;
    customerId: string;
    plan: PaidPlanKey;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey?: string;
  }): Promise<string> {
    const priceIds = await this.getPriceIds();
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: params.customerId,
        client_reference_id: params.userId,
        line_items: [{ price: priceIds[params.plan], quantity: 1 }],
        // Copied onto the subscription, so webhooks can find the user.
        subscription_data: { metadata: { userId: params.userId } },
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      },
      params.idempotencyKey
        ? { idempotencyKey: params.idempotencyKey }
        : undefined,
    );
    return session.url!;
  }

  async createPortalSession(customerId: string, returnUrl: string) {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session.url;
  }

  retrieveSubscription(id: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(id);
  }

  setCancelAtPeriodEnd(id: string, cancel: boolean) {
    return this.stripe.subscriptions.update(id, {
      cancel_at_period_end: cancel,
    });
  }

  /** Looks up our plans' price IDs by lookup key, once. */
  private getPriceIds(): Promise<Record<PaidPlanKey, string>> {
    this.priceIds ??= this.stripe.prices
      .list({ lookup_keys: PAID_PLAN_KEYS, active: true })
      .then(({ data }) => {
        const ids = Object.fromEntries(
          data.map((price) => [price.lookup_key, price.id]),
        );
        const missing = PAID_PLAN_KEYS.filter((key) => !ids[key]);
        if (missing.length) {
          throw new Error(
            `Stripe prices not found for ${missing.join(', ')}. Run: npm run stripe:setup`,
          );
        }
        return ids as Record<PaidPlanKey, string>;
      })
      .catch((error: unknown) => {
        this.priceIds = undefined; // try again next time
        throw error;
      });
    return this.priceIds;
  }
}
