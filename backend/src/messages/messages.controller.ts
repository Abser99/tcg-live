import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { User } from '../users/user.entity';

class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body: string;
}

@UseGuards(AuthGuard('jwt'))
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  getThreads(@CurrentUser() user: User) {
    return this.messagesService.getThreadsForUser(user.id);
  }

  @Get(':orderId')
  getMessages(@Param('orderId') orderId: string, @CurrentUser() user: User) {
    return this.messagesService.getMessages(orderId, user.id);
  }

  @Post(':orderId')
  sendMessage(
    @Param('orderId') orderId: string,
    @CurrentUser() user: User,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.save(orderId, user.id, user.username, dto.body);
  }
}
