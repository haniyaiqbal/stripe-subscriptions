import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module.js';
import { BillingPagesController } from './billing-pages.controller.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { StripeEvent } from './stripe-event.entity.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { StripeService } from './stripe.service.js';
import { Subscription } from './subscription.entity.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { WebhookService } from './webhook.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, StripeEvent]), UsersModule],
  controllers: [
    BillingController,
    StripeWebhookController,
    BillingPagesController,
  ],
  providers: [
    StripeService,
    SubscriptionsService,
    BillingService,
    WebhookService,
  ],
  exports: [TypeOrmModule],
})
export class BillingModule {}
