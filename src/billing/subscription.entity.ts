import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import type { User } from '../users/user.entity.js';
import type { PaidPlanKey } from './plans.js';

/**
 * Our copy of the user's Stripe subscription. Stripe is the source of
 * truth; this row is kept in sync by webhooks so we can check access
 * without calling Stripe on every request.
 */
@Entity({ name: 'subscriptions' })
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** One current subscription per user. */
  @Index({ unique: true })
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @OneToOne('User', (user: User) => user.subscription, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, name: 'stripe_subscription_id' })
  stripeSubscriptionId: string;

  @Column({ type: 'varchar', length: 32 })
  plan: PaidPlanKey;

  /** Stripe's status: active, trialing, past_due, canceled, unpaid, ... */
  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ type: 'timestamptz', name: 'current_period_end' })
  currentPeriodEnd: Date;

  /** True after "cancel": access continues until currentPeriodEnd. */
  @Column({ type: 'boolean', name: 'cancel_at_period_end', default: false })
  cancelAtPeriodEnd: boolean;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
