import { Policy } from '@nestjs/authorization';
import type { User } from '../users/user.entity.js';

@Policy()
export class AdminPolicy {
  view(user: User | null) {
    return user?.role === 'admin';
  }
}
