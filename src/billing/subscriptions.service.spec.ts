import type Stripe from 'stripe';
import type { EntityManager } from 'typeorm';
import { User } from '../users/user.entity.js';
import { Subscription } from './subscription.entity.js';
import { SubscriptionsService } from './subscriptions.service.js';

function stripeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { userId: 'user-1' },
    items: {
      data: [
        {
          current_period_end: 1_900_000_000,
          price: { lookup_key: 'pro_monthly' },
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe('SubscriptionsService.syncFromStripe', () => {
  const users = { findOneBy: vi.fn() };
  const subs = {
    findOneBy: vi.fn(),
    create: vi.fn((data: object) => data),
    save: vi.fn(async (data: object) => data),
  };
  const manager = {
    getRepository: (entity: unknown) => (entity === User ? users : subs),
  } as unknown as EntityManager;
  const service = new SubscriptionsService();

  beforeEach(() => {
    vi.clearAllMocks();
    users.findOneBy.mockResolvedValue({ id: 'user-1' });
    subs.findOneBy.mockResolvedValue(null);
  });

  it('copies the important fields', async () => {
    const saved = await service.syncFromStripe(manager, stripeSub());
    expect(saved).toMatchObject({
      userId: 'user-1',
      stripeSubscriptionId: 'sub_1',
      plan: 'pro_monthly',
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(1_900_000_000_000),
    });
  });

  it('finds the user by customer ID when metadata is missing', async () => {
    users.findOneBy.mockResolvedValueOnce({ id: 'user-2' }); // the customer lookup
    await service.syncFromStripe(manager, stripeSub({ metadata: {} }));
    expect(users.findOneBy).toHaveBeenCalledWith({ stripeCustomerId: 'cus_1' });
  });

  it('skips subscriptions that belong to nobody', async () => {
    users.findOneBy.mockResolvedValue(null);
    await expect(
      service.syncFromStripe(manager, stripeSub()),
    ).resolves.toBeNull();
    expect(subs.save).not.toHaveBeenCalled();
  });

  it('skips prices that are not one of our plans', async () => {
    const sub = stripeSub({
      items: {
        data: [{ current_period_end: 1, price: { lookup_key: 'other' } }],
      },
    });
    await expect(service.syncFromStripe(manager, sub)).resolves.toBeNull();
  });

  it('does not let an old, ended subscription overwrite a live one', async () => {
    const live = {
      userId: 'user-1',
      stripeSubscriptionId: 'sub_new',
      status: 'active',
    } as Subscription;
    subs.findOneBy.mockResolvedValue(live);
    const result = await service.syncFromStripe(
      manager,
      stripeSub({ id: 'sub_old', status: 'canceled' }),
    );
    expect(result).toBe(live);
    expect(subs.save).not.toHaveBeenCalled();
  });
});
