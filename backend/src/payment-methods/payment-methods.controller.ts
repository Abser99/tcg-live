import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentMethodsService } from './payment-methods.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@Controller('payment-methods')
@UseGuards(AuthGuard('jwt'))
export class PaymentMethodsController {
  constructor(private readonly service: PaymentMethodsService) {}

  @Get('my')
  findMy(@CurrentUser() user: User) {
    return this.service.findByUser(user.id);
  }

  @Get('my/has-any')
  async hasAny(@CurrentUser() user: User) {
    return { hasPaymentMethod: await this.service.hasPaymentMethod(user.id) };
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreatePaymentMethodDto) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id/default')
  setDefault(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.setDefault(id, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.remove(id, user.id);
  }
}
