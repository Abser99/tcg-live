import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { UpdateShippingDto } from './dto/update-shipping.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from './user.entity';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: User) {
    return user;
  }

  @Patch('me/shipping')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  updateShipping(@CurrentUser() user: User, @Body() dto: UpdateShippingDto) {
    return this.usersService.updateShipping(user.id, dto);
  }

  @Patch('me/address')
  updateAddress(@CurrentUser() user: User, @Body() dto: UpdateAddressDto) {
    return this.usersService.updateAddress(user.id, dto);
  }

  @Get(':id/profile')
  getProfile(@Param('id') id: string) {
    return this.usersService.getPublicProfile(id);
  }
}
