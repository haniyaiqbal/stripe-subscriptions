import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type Stripe from 'stripe';
import { DataSource } from 'typeorm';
import { StripeEvent } from './stripe-event.entity.js';
import { StripeService } from './stripe.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

/** Events that can change a subscription, and how to find its ID. */
const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

export type WebhookResult = 'processed' | 'duplicate' | 'ignored';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stripe: StripeService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async handle(event: Stripe.Event): Promise<WebhookResult> {
    // Cheap early exit for the common repeat. The insert below is what
    // actually guarantees "only once".
    if (
      await this.dataSource
        .getRepository(StripeEvent)
        .existsBy({ id: event.id })
    ) {
      return 'duplicate';
    }

    const subscriptionId = subscriptionIdOf(event);

    // Stripe doesn't promise to deliver events in order, so an old
    // "updated" event could arrive after a newer one. Instead of trusting
    // the event's copy, fetch the subscription as it is right now.
    const latest = subscriptionId
      ? await this.stripe.retrieveSubscription(subscriptionId)
      : null;

    return this.dataSource.transaction(async (manager) => {
      // Record the event ID first. If it's already there, Stripe is
      // sending it again: do nothing. The primary key makes this safe even
      // when two copies arrive at the same moment.
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(StripeEvent)
        .values({ id: event.id, type: event.type })
        .orIgnore()
        .returning('id')
        .execute();
      if (inserted.raw.length === 0) {
        this.logger.log(`Duplicate event ${event.id}, skipping`);
        return 'duplicate';
      }

      if (!latest) return 'ignored';

      // If this throws, the transaction rolls back (including the event
      // ID), we answer 500, and Stripe retries later.
      await this.subscriptions.syncFromStripe(manager, latest);
      return 'processed';
    });
  }
}

function subscriptionIdOf(event: Stripe.Event): string | null {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.mode !== 'subscription' || !session.subscription) return null;
    return typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription.id;
  }
  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    return (event.data.object as Stripe.Subscription).id;
  }
  return null;
}
