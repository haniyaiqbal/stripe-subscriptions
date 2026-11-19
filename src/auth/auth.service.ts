import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordHasher, TokenService } from '@nestjs/authentication';
import type { Env } from '../config/env.js';
import { tierOf, type User } from '../users/user.entity.js';
import { normalizeEmail, UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
  private readonly adminEmails: Set<string>;

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
    config: ConfigService<Env, true>,
  ) {
    this.adminEmails = new Set(config.get('ADMIN_EMAILS', { infer: true }));
  }

  async signUp(email: string, password: string) {
    if (await this.usersService.findByEmail(email)) {
      throw new ConflictException('Email already registered');
    }
    const role = this.adminEmails.has(normalizeEmail(email)) ? 'admin' : 'user';
    const user = await this.usersService.create(
      email,
      await this.passwordHasher.hash(password),
      role,
    );
    return this.issueTokens(user);
  }

  async signIn(email: string, password: string) {
    const found = await this.usersService.findWithPassword(email);
    // verify() still does the slow hash for unknown emails, so response
    // times don't reveal which emails are registered.
    const valid = await this.passwordHasher.verify(
      password,
      found?.passwordHash,
    );
    if (!found || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (this.passwordHasher.needsRehash(found.passwordHash)) {
      await this.usersService.updatePasswordHash(
        found.id,
        await this.passwordHasher.hash(password),
      );
    }
    return this.issueTokens(found);
  }

  private async issueTokens(user: User) {
    const { accessToken, expiresIn } = await this.tokenService.issue(user.id, {
      method: 'password',
      claims: { amr: ['pwd'] },
    });
    return { accessToken, expiresIn, user: toProfile(user) };
  }
}

export function toProfile(user: User) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    plan: tierOf(user),
  };
}
