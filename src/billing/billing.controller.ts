import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, Public } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { Throttle, minutes } from '@nestjs/throttler';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { User } from '../users/user.entity.js';
import { BillingService } from './billing.service.js';
import { PAID_PLAN_KEYS } from './plans.js';

const checkoutSchema = z.object({ plan: z.enum(PAID_PLAN_KEYS) });
type CheckoutDto = z.infer<typeof checkoutSchema>;

@ApiTags('billing')
@ApiBearerAuth()
@Controller('api/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Get('plans')
  plans() {
    return this.billing.listPlans();
  }

  @Can.Anyone()
  @Get('subscription')
  subscription(@CurrentUser() user: User) {
    return this.billing.getSubscription(user);
  }

  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Send the same key when retrying to get the same checkout.',
  })
  @Can.Anyone()
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @Post('checkout')
  @HttpCode(200)
  checkout(
    @CurrentUser() user: User,
    @Body({ schema: checkoutSchema }) body: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.billing.startCheckout(
      user,
      body.plan,
      idempotencyKey?.slice(0, 200),
    );
  }

  @Can.Anyone()
  @Post('portal')
  @HttpCode(200)
  portal(@CurrentUser() user: User) {
    return this.billing.openPortal(user);
  }

  @Can.Anyone()
  @Post('cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: User) {
    return this.billing.cancel(user);
  }

  @Can.Anyone()
  @Post('resume')
  @HttpCode(200)
  resume(@CurrentUser() user: User) {
    return this.billing.resume(user);
  }
}
