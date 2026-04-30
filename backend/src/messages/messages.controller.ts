import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';

@UseGuards(AuthGuard('jwt'))
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get(':orderId')
  getMessages(@Param('orderId') orderId: string, @CurrentUser('id') userId: string) {
    return this.messagesService.getMessages(orderId, userId);
  }
}
