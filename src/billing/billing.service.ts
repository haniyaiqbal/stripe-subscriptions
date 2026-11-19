import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Env } from '../config/env.js';
import { tierOf, tierOfSubscription, type User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { PAID_PLANS, type PaidPlanKey } from './plans.js';
import { StripeService } from './stripe.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

@Injectable()
export class BillingService {
  private readonly appUrl: string;

  constructor(
    private readonly stripe: StripeService,
    private readonly usersService: UsersService,
    private readonly subscriptions: SubscriptionsService,
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true }).replace(/\/$/, '');
  }

  listPlans() {
    return [
      { key: 'free', name: 'Free', amount: 0, currency: 'usd', interval: null },
      ...Object.entries(PAID_PLANS).map(([key, plan]) => ({ key, ...plan })),
    ];
  }

  /** Returns a Stripe Checkout URL. The app never sees card details. */
  async startCheckout(user: User, plan: PaidPlanKey, idempotencyKey?: string) {
    if (tierOf(user) === 'pro') {
      throw new ConflictException(
        'You already have Pro. Use the billing portal to switch plans.',
      );
    }
    const customerId = await this.ensureCustomer(user);
    const url = await this.stripe.createCheckoutSession({
      userId: user.id,
      customerId,
      plan,
      successUrl: `${this.appUrl}/billing/success`,
      cancelUrl: `${this.appUrl}/billing/cancelled`,
      // Scoped to the user, so two users can't collide on the same key.
      idempotencyKey: idempotencyKey
        ? `checkout:${user.id}:${idempotencyKey}`
        : undefined,
    });
    return { url };
  }

  /** Stripe's hosted page for changing card, switching plan, invoices. */
  async openPortal(user: User) {
    if (!user.stripeCustomerId) {
      throw new BadRequestException('No billing account yet. Subscribe first.');
    }
    const url = await this.stripe.createPortalSession(
      user.stripeCustomerId,
      `${this.appUrl}/billing/success`,
    );
    return { url };
  }

  getSubscription(user: User) {
    return {
      plan: tierOf(user),
      subscription: user.subscription ?? null,
    };
  }

  /** Cancel at the end of the period: they keep what they paid for. */
  cancel(user: User) {
    return this.setCancelAtPeriodEnd(user, true);
  }

  /** Undo a cancel before the period ends. */
  resume(user: User) {
    return this.setCancelAtPeriodEnd(user, false);
  }

  private async setCancelAtPeriodEnd(user: User, cancel: boolean) {
    const current = user.subscription;
    if (!current || tierOf(user) !== 'pro') {
      throw new NotFoundException('No active subscription');
    }
    const updated = await this.stripe.setCancelAtPeriodEnd(
      current.stripeSubscriptionId,
      cancel,
    );
    // Save the result straight away so the response is up to date. The
    // webhook for this change will arrive too and simply confirm it.
    const saved = await this.dataSource.transaction((manager) =>
      this.subscriptions.syncFromStripe(manager, updated),
    );
    return {
      plan: tierOfSubscription(saved),
      subscription: saved,
    };
  }

  private async ensureCustomer(user: User): Promise<string> {
    if (user.stripeCustomerId) return user.stripeCustomerId;
    const customerId = await this.stripe.createCustomer(user.id, user.email);
    return this.usersService.attachStripeCustomer(user.id, customerId);
  }
}
