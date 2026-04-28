import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Post('push-token')
  register(
    @CurrentUser() user: User,
    @Body('token') token: string,
    @Body('deviceId') deviceId?: string,
  ) {
    return this.service.registerToken(user.id, token, deviceId);
  }

  @Delete('push-token')
  remove(@Body('token') token: string) {
    return this.service.removeToken(token);
  }
}
