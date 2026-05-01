import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/user.entity';
import { TemplatesService } from './templates.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get('my')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  findMy(@CurrentUser('id') sellerId: string) {
    return this.templatesService.findMySaved(sellerId);
  }

  @Post('from-auction/:auctionId')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  fromAuction(@Param('auctionId') auctionId: string, @CurrentUser('id') sellerId: string) {
    return this.templatesService.fromAuction(auctionId, sellerId);
  }

  @Delete(':id')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  async delete(@Param('id') id: string, @CurrentUser('id') sellerId: string) {
    await this.templatesService.delete(id, sellerId);
    return { deleted: true };
  }
}
