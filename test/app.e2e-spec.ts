import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PasswordHasher } from '@nestjs/authentication';
import Stripe from 'stripe';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { StripeService } from '../src/billing/stripe.service.js';
import { FakeStripeService } from './fake-stripe.js';

/**
 * Runs the whole app against a real Postgres (`docker compose up -d postgres`)
 * with a fake Stripe, so no Stripe account or network is needed.
 */
describe('Stripe subscriptions (e2e)', () => {
  // Set in test/setup-e2e.ts, before the app reads its config.
  const adminEmail = process.env.ADMIN_EMAILS!;
  let app: INestApplication<App>;
  let stripe: FakeStripeService;
  let webhookSecret: string;
  const signer = new Stripe('sk_test_signing_only');

  const api = () => request(app.getHttpServer());

  async function signUp(email = `${randomUUID()}@test.dev`) {
    const res = await api()
      .post('/api/auth/sign-up')
      .send({ email, password: 'correct-horse-battery' })
      .expect(201);
    return {
      token: res.body.accessToken as string,
      id: res.body.user.id as string,
    };
  }

  /** Sends a webhook signed exactly like Stripe does. */
  function sendWebhook(event: object, secret = webhookSecret) {
    const payload = JSON.stringify(event);
    const signature = signer.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    return api()
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature)
      .send(payload);
  }

  function subscriptionEvent(type: string, sub: Stripe.Subscription) {
    return {
      id: `evt_${randomUUID()}`,
      object: 'event',
      type,
      data: { object: sub },
    };
  }

  /** A user who has paid: checkout started, then Stripe's webhook arrived. */
  async function subscribedUser() {
    const user = await signUp();
    await api()
      .post('/api/billing/checkout')
      .auth(user.token, { type: 'bearer' })
      .send({ plan: 'pro_monthly' })
      .expect(200);
    const sub = stripe.putSubscription({
      userId: user.id,
      customerId: `cus_test_${user.id.slice(0, 8)}`,
      plan: 'pro_monthly',
      status: 'active',
    });
    await sendWebhook(
      subscriptionEvent('customer.subscription.created', sub),
    ).expect(200);
    return { ...user, sub };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StripeService)
      .useFactory({
        factory: (config: ConfigService) =>
          new FakeStripeService(config as never),
        inject: [ConfigService],
      })
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    stripe = app.get(StripeService);
    webhookSecret = app.get(ConfigService).getOrThrow('STRIPE_WEBHOOK_SECRET');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lists plans publicly', async () => {
    const { body } = await api().get('/api/billing/plans').expect(200);
    expect(body.map((p: { key: string }) => p.key)).toEqual([
      'free',
      'pro_monthly',
      'pro_yearly',
    ]);
  });

  it('new users start on Free, limited to 3 projects and no export', async () => {
    const { token } = await signUp();
    const auth = { Authorization: `Bearer ${token}` };

    const me = await api().get('/api/auth/me').set(auth).expect(200);
    expect(me.body.plan).toBe('free');

    for (let i = 1; i <= 3; i++) {
      await api()
        .post('/api/projects')
        .set(auth)
        .send({ name: `P${i}` })
        .expect(201);
    }
    const blocked = await api()
      .post('/api/projects')
      .set(auth)
      .send({ name: 'P4' })
      .expect(403);
    expect(blocked.body.errorCode).toBe('upgrade_required');
    await api().get('/api/projects/export').set(auth).expect(403);
  });

  it('starts a Stripe Checkout and passes the idempotency key on', async () => {
    const { token, id } = await signUp();
    const { body } = await api()
      .post('/api/billing/checkout')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', 'retry-123')
      .send({ plan: 'pro_yearly' })
      .expect(200);
    expect(body.url).toContain('checkout.stripe.test');
    expect(stripe.checkoutCalls.at(-1)).toMatchObject({
      userId: id,
      plan: 'pro_yearly',
      idempotencyKey: `checkout:${id}:retry-123`,
    });
  });

  it('rejects unknown plans', async () => {
    const { token } = await signUp();
    await api()
      .post('/api/billing/checkout')
      .auth(token, { type: 'bearer' })
      .send({ plan: 'platinum' })
      .expect(400);
  });

  it('upgrades to Pro when Stripe confirms the subscription', async () => {
    const { token } = await subscribedUser();
    const auth = { Authorization: `Bearer ${token}` };

    const me = await api().get('/api/auth/me').set(auth).expect(200);
    expect(me.body.plan).toBe('pro');

    for (let i = 1; i <= 5; i++) {
      await api()
        .post('/api/projects')
        .set(auth)
        .send({ name: `=SUM(A${i})` })
        .expect(201);
    }
    const csv = await api().get('/api/projects/export').set(auth).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.trim().split('\n')).toHaveLength(6);
    // Formula injection is neutralised.
    expect(csv.text).toContain(`"'=SUM(A1)"`);
  });

  it('rejects webhooks with a bad signature', async () => {
    const user = await signUp();
    const sub = stripe.putSubscription({
      userId: user.id,
      customerId: 'cus_x',
      plan: 'pro_monthly',
      status: 'active',
    });
    await sendWebhook(
      subscriptionEvent('customer.subscription.created', sub),
      'whsec_wrong',
    ).expect(400);
    await api()
      .post('/api/webhooks/stripe')
      .send({ id: 'evt_unsigned', type: 'customer.subscription.created' })
      .expect(400);
    const me = await api()
      .get('/api/auth/me')
      .auth(user.token, { type: 'bearer' });
    expect(me.body.plan).toBe('free');
  });

  it('processes a repeated event only once', async () => {
    const user = await signUp();
    const sub = stripe.putSubscription({
      userId: user.id,
      customerId: 'cus_dup',
      plan: 'pro_monthly',
      status: 'active',
    });
    const event = subscriptionEvent('customer.subscription.created', sub);

    const first = await sendWebhook(event).expect(200);
    expect(first.body.result).toBe('processed');

    // Stripe changes the subscription, but resends the OLD event.
    stripe.putSubscription({
      id: sub.id,
      userId: user.id,
      customerId: 'cus_dup',
      plan: 'pro_monthly',
      status: 'canceled',
    });
    const again = await sendWebhook(event).expect(200);
    expect(again.body.result).toBe('duplicate');

    const me = await api()
      .get('/api/auth/me')
      .auth(user.token, { type: 'bearer' });
    expect(me.body.plan).toBe('pro');
  });

  it('uses the latest subscription state, not the event copy', async () => {
    const user = await signUp();
    const sub = stripe.putSubscription({
      userId: user.id,
      customerId: 'cus_order',
      plan: 'pro_monthly',
      status: 'active',
    });
    // The newest state in Stripe is "canceled"...
    stripe.putSubscription({
      id: sub.id,
      userId: user.id,
      customerId: 'cus_order',
      plan: 'pro_monthly',
      status: 'canceled',
    });
    // ...but an older "active" event arrives late.
    await sendWebhook(
      subscriptionEvent('customer.subscription.updated', sub),
    ).expect(200);

    const me = await api()
      .get('/api/auth/me')
      .auth(user.token, { type: 'bearer' });
    expect(me.body.plan).toBe('free');
  });

  it('cancels at period end and can resume', async () => {
    const { token } = await subscribedUser();
    const auth = { Authorization: `Bearer ${token}` };

    const cancelled = await api()
      .post('/api/billing/cancel')
      .set(auth)
      .expect(200);
    expect(cancelled.body.subscription.cancelAtPeriodEnd).toBe(true);
    // Still Pro until the period they paid for ends.
    expect(cancelled.body.plan).toBe('pro');

    const resumed = await api()
      .post('/api/billing/resume')
      .set(auth)
      .expect(200);
    expect(resumed.body.subscription.cancelAtPeriodEnd).toBe(false);
  });

  it('drops to Free when the subscription ends', async () => {
    const { token, id, sub } = await subscribedUser();
    const ended = stripe.putSubscription({
      id: sub.id,
      userId: id,
      customerId: 'cus_end',
      plan: 'pro_monthly',
      status: 'canceled',
    });
    await sendWebhook(
      subscriptionEvent('customer.subscription.deleted', ended),
    ).expect(200);

    const me = await api().get('/api/auth/me').auth(token, { type: 'bearer' });
    expect(me.body.plan).toBe('free');
    await api()
      .get('/api/projects/export')
      .auth(token, { type: 'bearer' })
      .expect(403);
  });

  it('refuses a second checkout while already on Pro', async () => {
    const { token } = await subscribedUser();
    await api()
      .post('/api/billing/checkout')
      .auth(token, { type: 'bearer' })
      .send({ plan: 'pro_yearly' })
      .expect(409);
  });

  it('keeps admin routes for admins only', async () => {
    const user = await signUp();
    await api()
      .get('/api/admin/stats')
      .auth(user.token, { type: 'bearer' })
      .expect(403);
    await api().get('/api/admin/stats').expect(401);

    const admin = await signUp(adminEmail);
    const stats = await api()
      .get('/api/admin/stats')
      .auth(admin.token, { type: 'bearer' })
      .expect(200);
    expect(stats.body.users).toBeGreaterThan(0);
    expect(stats.body.proSubscribers).toBeGreaterThan(0);
    expect(stats.body.mrrCents).toBeGreaterThan(0);

    const users = await api()
      .get('/api/admin/users?limit=5')
      .auth(admin.token, { type: 'bearer' })
      .expect(200);
    expect(users.body.items).toHaveLength(5);
  });
});
