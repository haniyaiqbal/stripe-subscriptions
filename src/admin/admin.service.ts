import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { monthlyAmount, type PaidPlanKey } from '../billing/plans.js';
import { Subscription } from '../billing/subscription.entity.js';
import { tierOf, User } from '../users/user.entity.js';

/** Counted as paying customers (`past_due` is still being retried). */
const PAYING = ['active', 'trialing', 'past_due'];

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
  ) {}

  async listUsers(page: number, limit: number) {
    const [items, total] = await this.users.findAndCount({
      relations: { subscription: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: items.map((user) => ({
        id: user.id,
        email: user.email,
        role: user.role,
        plan: tierOf(user),
        subscription: user.subscription
          ? {
              plan: user.subscription.plan,
              status: user.subscription.status,
              currentPeriodEnd: user.subscription.currentPeriodEnd,
              cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
            }
          : null,
        createdAt: user.createdAt,
      })),
      page,
      limit,
      total,
    };
  }

  async stats() {
    const [users, paying] = await Promise.all([
      this.users.count(),
      this.subscriptions.findBy({ status: In(PAYING) }),
    ]);
    const byPlan: Partial<Record<PaidPlanKey, number>> = {};
    for (const sub of paying) byPlan[sub.plan] = (byPlan[sub.plan] ?? 0) + 1;

    return {
      users,
      proSubscribers: paying.length,
      byPlan,
      pastDue: paying.filter((s) => s.status === 'past_due').length,
      cancelling: paying.filter((s) => s.cancelAtPeriodEnd).length,
      // Monthly recurring revenue in cents; yearly plans count as 1/12.
      mrrCents: paying.reduce((sum, s) => sum + monthlyAmount(s.plan), 0),
    };
  }
}
