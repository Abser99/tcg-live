import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/user.entity';

/** Reporting for the admin console. Everything here is admin-only. */
@Controller('admin/stats')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** Platform headline numbers. */
  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  /** Per-seller activity, biggest earners first. */
  @Get('sellers')
  sellers(@Query('limit') limit?: string) {
    return this.admin.sellers(Math.min(200, Math.max(1, Number(limit) || 50)));
  }

  /** Per-buyer activity, biggest spenders first. */
  @Get('buyers')
  buyers(@Query('limit') limit?: string) {
    return this.admin.buyers(Math.min(200, Math.max(1, Number(limit) || 50)));
  }
}
