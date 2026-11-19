import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { ApiExcludeController } from '@nestjs/swagger';

/** Where Stripe Checkout sends people back to. A real app would use its frontend. */
@ApiExcludeController()
@Public()
@Controller('billing')
export class BillingPagesController {
  @Get('success')
  @Header('Content-Type', 'text/html; charset=utf-8')
  success() {
    return page(
      'Thanks! 🎉',
      'Your payment went through. Pro will be active in a few seconds.',
    );
  }

  @Get('cancelled')
  @Header('Content-Type', 'text/html; charset=utf-8')
  cancelled() {
    return page('Checkout cancelled', 'No payment was taken.');
  }
}

function page(title: string, text: string) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>
<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>${title}</h1><p>${text}</p><p>You can close this tab.</p></body>`;
}
