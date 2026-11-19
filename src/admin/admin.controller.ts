import { Controller, Get, Query } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AdminPolicy } from './admin.policy.js';
import { AdminService } from './admin.service.js';

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
type PageQuery = z.infer<typeof pageSchema>;

/** Admins only. Everyone else gets 403 before the handler runs. */
@ApiTags('admin')
@ApiBearerAuth()
@Can(AdminPolicy, 'view')
@Controller('api/admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  users(@Query({ schema: pageSchema }) { page, limit }: PageQuery) {
    return this.admin.listUsers(page, limit);
  }

  @Get('stats')
  stats() {
    return this.admin.stats();
  }
}
