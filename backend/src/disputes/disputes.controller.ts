import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DisputesService } from './disputes.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/user.entity';

@Controller('disputes')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post()
  open(@CurrentUser() user: User, @Body() dto: CreateDisputeDto) {
    return this.disputesService.openDispute(user.id, dto);
  }

  @Get('my')
  findMine(@CurrentUser() user: User) {
    return this.disputesService.findMine(user.id);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.disputesService.findAll();
  }

  @Patch(':id/resolve')
  @Roles(UserRole.ADMIN)
  resolve(@Param('id') id: string, @Body() dto: ResolveDisputeDto) {
    return this.disputesService.resolve(id, dto);
  }
}
