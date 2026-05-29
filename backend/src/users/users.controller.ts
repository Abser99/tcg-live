import { Body, Controller, Get, Param, Patch, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { UpdateShippingDto } from './dto/update-shipping.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from './user.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  me(@CurrentUser() user: User) {
    return user;
  }

  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'))
  changePassword(@CurrentUser() user: User, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(user.id, dto);
  }

  @Patch('me/shipping')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  updateShipping(@CurrentUser() user: User, @Body() dto: UpdateShippingDto) {
    return this.usersService.updateShipping(user.id, dto);
  }

  @Patch('me/address')
  @UseGuards(AuthGuard('jwt'))
  updateAddress(@CurrentUser() user: User, @Body() dto: UpdateAddressDto) {
    return this.usersService.updateAddress(user.id, dto);
  }

  // ── Admin endpoints ────────────────────────────────────────────

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  listAllUsers(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.usersService.findAllUsers(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Patch(':id/suspend')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  suspendUser(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.usersService.suspendUser(id, body.reason);
  }

  @Patch(':id/unsuspend')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  unsuspendUser(@Param('id') id: string) {
    return this.usersService.unsuspendUser(id);
  }

  // Public endpoints — no auth required
  @Get('by-username/:username/profile')
  getProfileByUsername(@Param('username') username: string) {
    return this.usersService.getPublicProfileByUsername(username);
  }

  @Get(':id/profile')
  getProfile(@Param('id') id: string) {
    return this.usersService.getPublicProfile(id);
  }
}
