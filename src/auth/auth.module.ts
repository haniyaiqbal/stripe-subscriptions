import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticationModule } from '@nestjs/authentication';
import { AuthorizationModule } from '@nestjs/authorization';
import type { Env } from '../config/env.js';
import type { User } from '../users/user.entity.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuth } from './jwt-auth.provider.js';

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: User;
    // Short-lived access tokens only: sign in again when one expires.
    refreshTokens: false;
  }
}

@Module({
  imports: [
    // 1. Authentication: a global guard that needs a valid token on every
    //    route not marked @Public(), and sets the current user.
    AuthenticationModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        accessToken: {
          key: config.get('JWT_SECRET', { infer: true }),
          issuer: 'stripe-subscriptions',
          audience: 'stripe-subscriptions-api',
          ttl: '1h',
        },
        refreshToken: false,
      }),
    }),
    // 2. Authorization: a global guard that denies by default. Every route
    //    must say who may call it (@Can, @Can.Anyone or @Public).
    AuthorizationModule.forRoot(),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuth],
})
export class AuthModule {}
