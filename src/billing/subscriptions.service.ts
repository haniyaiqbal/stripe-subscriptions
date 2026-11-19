import { Injectable, Logger } from '@nestjs/common';
import type Stripe from 'stripe';
import type { EntityManager } from 'typeorm';
import { User } from '../users/user.entity.js';
import { grantsAccess, isPaidPlanKey } from './plans.js';
import { Subscription } from './subscription.entity.js';

/** Copies a Stripe subscription into our `subscriptions` table. */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  /**
   * Runs inside the webhook's transaction (`manager`), so the event is
   * only marked as processed if this succeeds.
   */
  async syncFromStripe(
    manager: EntityManager,
    stripeSub: Stripe.Subscription,
  ): Promise<Subscription | null> {
    const user = await this.findOwner(manager, stripeSub);
    if (!user) {
      // Not one of ours (e.g. created by hand in the Stripe dashboard).
      this.logger.warn(`No user for subscription ${stripeSub.id}, skipping`);
      return null;
    }

    const item = stripeSub.items.data[0];
    const plan = item?.price.lookup_key;
    if (!item || !isPaidPlanKey(plan)) {
      this.logger.warn(
        `Subscription ${stripeSub.id} has unknown price, skipping`,
      );
      return null;
    }

    const repo = manager.getRepository(Subscription);
    const existing = await repo.findOneBy({ userId: user.id });

    // A user can only have one current subscription. If an old, finished
    // subscription sends a late update, it must not overwrite a live one.
    if (
      existing &&
      existing.stripeSubscriptionId !== stripeSub.id &&
      grantsAccess(existing.status) &&
      !grantsAccess(stripeSub.status)
    ) {
      return existing;
    }

    const row = existing ?? repo.create({ userId: user.id });
    Object.assign(row, {
      stripeSubscriptionId: stripeSub.id,
      plan,
      status: stripeSub.status,
      // Since API version 2025-03, the billing period lives on the item.
      currentPeriodEnd: new Date(item.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    });
    return repo.save(row);
  }

  /** userId from metadata first (we set it at checkout), else the customer. */
  private async findOwner(
    manager: EntityManager,
    stripeSub: Stripe.Subscription,
  ): Promise<User | null> {
    const users = manager.getRepository(User);
    const userId = stripeSub.metadata?.userId;
    if (userId) {
      const user = await users.findOneBy({ id: userId });
      if (user) return user;
    }
    const customerId =
      typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : stripeSub.customer.id;
    return users.findOneBy({ stripeCustomerId: customerId });
  }
}
