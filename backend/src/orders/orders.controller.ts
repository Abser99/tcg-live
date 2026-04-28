import { Body, Controller, Get, Param, Patch, UseGuards, Post } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OrdersService } from './orders.service';
import { ShippingService } from '../shipping/shipping.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/user.entity';
import { OrderStatus } from './entities/order.entity';

@Controller('orders')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly shippingService: ShippingService,
  ) {}

  @Get('my')
  getMyOrders(@CurrentUser() user: User) {
    return this.ordersService.getMyOrders(user.id);
  }

  @Get('auction/:auctionId')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  getAuctionOrders(@Param('auctionId') auctionId: string, @CurrentUser() user: User) {
    return this.ordersService.getAuctionOrders(auctionId, user.id);
  }

  @Patch(':id/shipping-choice')
  setShippingChoice(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body('choice') choice: 'combined' | 'individual',
  ) {
    return this.ordersService.setShippingChoice(id, user.id, choice);
  }

  @Patch(':id/status')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body('status') status: OrderStatus,
  ) {
    return this.ordersService.updateStatus(id, user.id, status);
  }

  @Patch(':id/received')
  confirmReceived(@Param('id') id: string, @CurrentUser() user: User) {
    return this.ordersService.confirmReceived(id, user.id);
  }

  @Post(':id/rate')
  rateOrder(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body('rating') rating: number,
    @Body('note') note?: string,
  ) {
    return this.ordersService.rateOrder(id, user.id, rating, note);
  }

  @Post(':id/label')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  async generateLabel(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { carrierId: string; originZip: string; destinationZip: string; weightKg: number },
  ) {
    const label = await this.shippingService.createLabel({
      carrierId: body.carrierId,
      originZip: body.originZip,
      destinationZip: body.destinationZip,
      weightKg: body.weightKg,
    });
    return this.ordersService.attachShipping(id, user.id, {
      shippingCost: label.priceCents,
      carrier: label.carrier,
      trackingNumber: label.trackingNumber,
      labelUrl: label.labelUrl,
    });
  }
}
