import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { IncidentsService } from './incidents.service';
import { IncidentKind, IncidentStatus } from './entities/incident.entity';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/user.entity';

class CreateIncidentDto {
  @IsEnum(IncidentKind) kind: IncidentKind;
  @IsString() @MaxLength(2000) description: string;
  /** Set when reporting from inside a live — marks the moment in its recording. */
  @IsString() @IsOptional() auctionId?: string;
  @IsString() @IsOptional() orderId?: string;
  @IsString() @MaxLength(40) @IsOptional() reportedUsername?: string;
}

class ResolveIncidentDto {
  @IsEnum(IncidentStatus) status: IncidentStatus;
  @IsString() @MaxLength(2000) @IsOptional() adminNote?: string;
}

@Controller('incidents')
@UseGuards(AuthGuard('jwt'))
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  /** Report something — from inside a live or from the support screen. */
  @Post()
  create(@Body() dto: CreateIncidentDto, @CurrentUser() user: User) {
    return this.incidents.create(user.id, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.incidents.mine(user.id);
  }

  /** The admin queue. */
  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  list(@Query('status') status?: IncidentStatus) {
    return this.incidents.list(status);
  }

  @Patch(':id/resolve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  resolve(@Param('id') id: string, @Body() dto: ResolveIncidentDto) {
    return this.incidents.resolve(id, dto.status, dto.adminNote);
  }
}
