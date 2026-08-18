import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  /** In-app notification feed for the bell. */
  @Get()
  async list(@CurrentUser() user: User) {
    const [items, unread] = await Promise.all([
      this.service.listForUser(user.id),
      this.service.unreadCount(user.id),
    ]);
    return { items, unread };
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: User) {
    return this.service.markAllRead(user.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: User, @Param('id') id: string) {
    return this.service.markRead(user.id, id);
  }

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
