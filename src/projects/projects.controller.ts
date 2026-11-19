import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { User } from '../users/user.entity.js';
import { ProjectPolicy } from './project.policy.js';
import { ProjectsService } from './projects.service.js';

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
type CreateProjectDto = z.infer<typeof createProjectSchema>;

@ApiTags('projects')
@ApiBearerAuth()
@Controller('api/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Can(ProjectPolicy, 'use')
  @Get()
  list(@CurrentUser() user: User) {
    return this.projects.list(user);
  }

  /** Free: up to 3. Pro: unlimited. */
  @Can(ProjectPolicy, 'use')
  @Post()
  create(
    @CurrentUser() user: User,
    @Body({ schema: createProjectSchema }) body: CreateProjectDto,
  ) {
    return this.projects.create(user, body.name);
  }

  /** Pro only: blocked by the policy before this code runs. */
  @Can(ProjectPolicy, 'export')
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="projects.csv"')
  export(@CurrentUser() user: User) {
    return this.projects.exportCsv(user);
  }

  @Can(ProjectPolicy, 'use')
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: User,
    @Param('id', { schema: z.uuid() }) id: string,
  ) {
    return this.projects.remove(user, id);
  }
}
