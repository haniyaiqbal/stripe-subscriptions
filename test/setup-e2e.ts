import { randomUUID } from 'node:crypto';

// Runs before the app is imported (which is when it reads its settings).
// A fresh admin email per run, so repeated runs don't collide.
process.env.ADMIN_EMAILS = `admin-${randomUUID()}@test.dev`;
