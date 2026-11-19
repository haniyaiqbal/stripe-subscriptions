import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Every Stripe event we've processed. Stripe can send the same event more
 * than once; the primary key on the event ID makes sure we act on it once.
 */
@Entity({ name: 'stripe_events' })
export class StripeEvent {
  /** Stripe's event ID, e.g. evt_1Q... */
  @PrimaryColumn({ type: 'varchar', length: 255 })
  id: string;

  @Column({ type: 'varchar', length: 128 })
  type: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'processed_at' })
  processedAt: Date;
}
