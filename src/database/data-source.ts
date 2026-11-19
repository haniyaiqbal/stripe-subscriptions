import { join } from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { StripeEvent } from '../billing/stripe-event.entity.js';
import { Subscription } from '../billing/subscription.entity.js';
import { Project } from '../projects/project.entity.js';
import { User } from '../users/user.entity.js';

/** Shared by the app and the TypeORM CLI, so migrations match the entities. */
export const dataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Subscription, StripeEvent, Project],
  // .ts when run through the CLI (tsx), .js once built.
  migrations: [join(import.meta.dirname, 'migrations', '*.{ts,js}')],
} satisfies DataSourceOptions;

export default new DataSource(dataSourceOptions);
