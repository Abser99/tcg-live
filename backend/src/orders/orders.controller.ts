import { Body, Controller, Get, Param, Patch, UseGuards, Post } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';
import { OrdersService } from './orders.service';
import { ShippingService } from '../shipping/shipping.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/user.entity';
import { OrderStatus } from './entities/order.entity';

class RateOrderDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @MaxLength(300)
  @IsOptional()
  note?: string;
}

class UpdateStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}

class UpdateTrackingDto {
  @IsString()
  @MaxLength(200)
  trackingNumber: string;
}

class ShippingChoiceDto {
  @IsEnum(['combined', 'individual'])
  choice: 'combined' | 'individual';
}

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

  @Get('selling')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  getSellerOrders(@CurrentUser() user: User) {
    return this.ordersService.getSellerOrders(user.id);
  }

  @Get('seller-stats')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  getSellerStats(@CurrentUser() user: User) {
    return this.ordersService.getSellerStats(user.id);
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
    @Body() dto: ShippingChoiceDto,
  ) {
    return this.ordersService.setShippingChoice(id, user.id, dto.choice);
  }

  @Patch(':id/status')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.ordersService.updateStatus(id, user.id, dto.status);
  }

  @Patch(':id/tracking')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  updateTracking(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateTrackingDto,
  ) {
    return this.ordersService.updateTracking(id, user.id, dto.trackingNumber);
  }

  @Patch(':id/received')
  confirmReceived(@Param('id') id: string, @CurrentUser() user: User) {
    return this.ordersService.confirmReceived(id, user.id);
  }

  @Post(':id/rate')
  rateOrder(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: RateOrderDto,
  ) {
    return this.ordersService.rateOrder(id, user.id, dto.rating, dto.note);
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
