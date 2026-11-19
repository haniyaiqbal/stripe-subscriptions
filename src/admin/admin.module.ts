import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from '../billing/subscription.entity.js';
import { User } from '../users/user.entity.js';
import { AdminController } from './admin.controller.js';
import { AdminPolicy } from './admin.policy.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([User, Subscription])],
  controllers: [AdminController],
  providers: [AdminService, AdminPolicy],
})
export class AdminModule {}
