import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SellerApplicationsService } from './seller-applications.service';
import { ApplySellerDto } from './dto/apply-seller.dto';
import { ReviewApplicationDto } from './dto/review-application.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/user.entity';
import { ApplicationStatus } from './seller-application.entity';

@Controller('seller-applications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SellerApplicationsController {
  constructor(private readonly service: SellerApplicationsService) {}

  // Any logged-in user can apply
  @Post()
  apply(@CurrentUser() user: User, @Body() dto: ApplySellerDto) {
    return this.service.apply(user.id, dto);
  }

  // Check own application status
  @Get('me')
  myApplication(@CurrentUser() user: User) {
    return this.service.getMyApplication(user.id);
  }

  // Admin only — list all applications
  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@Query('status') status?: ApplicationStatus) {
    return this.service.findAll(status);
  }

  // Admin only — approve or reject
  @Patch(':id/review')
  @Roles(UserRole.ADMIN)
  review(
    @Param('id') id: string,
    @CurrentUser() admin: User,
    @Body() dto: ReviewApplicationDto,
  ) {
    return this.service.review(id, admin.id, dto);
  }
}
