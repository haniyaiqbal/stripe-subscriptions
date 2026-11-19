import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { StripeService } from './stripe.service.js';
import { WebhookService } from './webhook.service.js';

/**
 * Stripe calls this when something happens to a payment or subscription.
 * Public (Stripe has no login), but every request must carry a valid
 * Stripe signature.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('api/webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly webhooks: WebhookService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!signature || !req.rawBody) {
      throw new BadRequestException('Missing Stripe signature');
    }

    let event;
    try {
      // The signature covers the exact bytes Stripe sent, so this must use
      // the raw body, not the parsed JSON.
      event = this.stripe.constructEvent(req.rawBody, signature);
    } catch (error) {
      this.logger.warn(`Bad webhook signature: ${(error as Error).message}`);
      throw new BadRequestException('Invalid Stripe signature');
    }

    const result = await this.webhooks.handle(event);
    return { received: true, result };
  }
}
