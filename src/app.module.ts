import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerGuard, ThrottlerModule, minutes } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BillingModule } from './billing/billing.module.js';
import { StripeErrorFilter } from './billing/stripe-error.filter.js';
import { envSchema, type Env } from './config/env.js';
import { dataSourceOptions } from './database/data-source.js';
import { HealthController } from './health/health.controller.js';
import { ProjectsModule } from './projects/projects.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        ...dataSourceOptions,
        url: config.get('DATABASE_URL', { infer: true }),
        // Applies pending migrations on startup. Never `synchronize`.
        migrationsRun: true,
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [{ name: 'default', ttl: minutes(1), limit: 100 }],
        // Tests sign up many users in a few seconds.
        skipIf: () => config.get('NODE_ENV', { infer: true }) === 'test',
      }),
    }),
    TerminusModule,
    // Order matters: authentication sets the user, authorization reads it.
    AuthModule,
    UsersModule,
    BillingModule,
    ProjectsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_PIPE, useValue: new StandardSchemaValidationPipe() },
    { provide: APP_FILTER, useClass: StripeErrorFilter },
  ],
})
export class AppModule {}
