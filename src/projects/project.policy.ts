import { Policy } from '@nestjs/authorization';
import { tierOf, type User } from '../users/user.entity.js';

/** Who can do what with projects. Guests arrive as `null`. */
@Policy()
export class ProjectPolicy {
  use(user: User | null) {
    return user !== null;
  }

  /** CSV export is a Pro feature. */
  export(user: User | null) {
    return tierOf(user) === 'pro';
  }
}
