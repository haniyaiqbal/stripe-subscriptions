import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FREE_PROJECT_LIMIT } from '../billing/plans.js';
import { tierOf, type User } from '../users/user.entity.js';
import { Project } from './project.entity.js';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
  ) {}

  list(user: User) {
    return this.projects.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });
  }

  async create(user: User, name: string) {
    if (tierOf(user) === 'free') {
      const count = await this.projects.countBy({ userId: user.id });
      if (count >= FREE_PROJECT_LIMIT) {
        throw new ForbiddenException({
          message: `The Free plan includes ${FREE_PROJECT_LIMIT} projects. Upgrade to Pro for unlimited projects.`,
          errorCode: 'upgrade_required',
        });
      }
    }
    return this.projects.save(this.projects.create({ userId: user.id, name }));
  }

  async remove(user: User, id: string) {
    const { affected } = await this.projects.delete({ id, userId: user.id });
    if (!affected) throw new NotFoundException('Project not found');
  }

  async exportCsv(user: User): Promise<string> {
    const rows = await this.list(user);
    const lines = rows.map(
      (p) => `${p.id},${csvCell(p.name)},${p.createdAt.toISOString()}`,
    );
    return ['id,name,created_at', ...lines].join('\n') + '\n';
  }
}

/** Quotes a value for CSV and blocks spreadsheet formula injection. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
