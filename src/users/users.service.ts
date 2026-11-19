import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User, type Role } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** Loaded on every request, with the subscription so access checks are current. */
  findById(id: string): Promise<User | null> {
    return this.users.findOne({
      where: { id },
      relations: { subscription: true },
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email: normalizeEmail(email) });
  }

  findByStripeCustomerId(customerId: string): Promise<User | null> {
    return this.users.findOneBy({ stripeCustomerId: customerId });
  }

  /** Includes the password hash, which normal reads leave out. */
  findWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.subscription', 'subscription')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  async create(email: string, passwordHash: string, role: Role): Promise<User> {
    const saved = await this.users.save(
      this.users.create({ email: normalizeEmail(email), passwordHash, role }),
    );
    return (await this.findById(saved.id))!;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.users.update({ id }, { passwordHash });
  }

  /**
   * Saves the Stripe customer ID only if the user doesn't have one yet.
   * Returns the ID that ended up stored, so two parallel checkouts agree.
   */
  async attachStripeCustomer(id: string, customerId: string): Promise<string> {
    await this.users.update(
      { id, stripeCustomerId: IsNull() },
      { stripeCustomerId: customerId },
    );
    const user = await this.users.findOneByOrFail({ id });
    return user.stripeCustomerId!;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
