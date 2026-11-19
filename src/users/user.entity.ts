import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import type { Subscription } from '../billing/subscription.entity.js';
import { grantsAccess } from '../billing/plans.js';

export type Role = 'user' | 'admin';
export type Tier = 'free' | 'pro';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Always stored lower-case. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'text', name: 'password_hash', select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 16, default: 'user' })
  role: Role;

  /** Set the first time the user starts a checkout. */
  @Index({ unique: true })
  @Column({
    type: 'varchar',
    length: 255,
    name: 'stripe_customer_id',
    nullable: true,
  })
  stripeCustomerId: string | null;

  @OneToOne('Subscription', (subscription: Subscription) => subscription.user)
  subscription?: Relation<Subscription> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

/** Pro if the user has a subscription whose status still grants access. */
export function tierOf(user: User | null | undefined): Tier {
  return tierOfSubscription(user?.subscription);
}

export function tierOfSubscription(
  subscription: { status: string } | null | undefined,
): Tier {
  return grantsAccess(subscription?.status) ? 'pro' : 'free';
}
