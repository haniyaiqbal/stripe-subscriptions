import {
  Catch,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import Stripe from 'stripe';

/**
 * When a call to Stripe fails (outage, bad key, card problem), answer with
 * a clear 502 instead of a generic 500, and log Stripe's details for us.
 * Stripe's message isn't sent to the client: it can mention our account.
 */
@Catch(Stripe.errors.StripeError)
export class StripeErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Stripe');

  catch(error: Stripe.errors.StripeError, host: ArgumentsHost) {
    this.logger.error(
      `${error.type} (${error.statusCode ?? '-'}): ${error.message} [request ${error.requestId ?? '-'}]`,
    );
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.BAD_GATEWAY)
      .json({
        statusCode: HttpStatus.BAD_GATEWAY,
        message:
          'The payment provider could not complete the request. Please try again.',
        errorCode: 'payment_provider_error',
      });
  }
}
