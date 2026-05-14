import { Body, Controller, Get, Param, Post, UseGuards, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentsService } from './payments.service';
import { OrdersService } from '../orders/orders.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { Order } from '../orders/entities/order.entity';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly ordersService: OrdersService,
  ) {}

  /** Buyer initiates checkout for a won order */
  @Post('checkout')
  @UseGuards(AuthGuard('jwt'))
  async checkout(
    @CurrentUser() user: User,
    @Body('orderId') orderId: string,
    @Body('backUrls') backUrls?: { success: string; failure: string; pending: string },
  ): Promise<{ order: Order; initPoint: string; sandboxInitPoint: string }> {
    const order = await this.ordersService.getOrderForCheckout(orderId, user.id);
    const items = order.items.map(i => ({ title: i.cardName, quantity: 1, unitPrice: i.finalPrice }));
    const pref = await this.paymentsService.createPreference({ orderId, items, buyerEmail: user.email, backUrls });
    const isMock = pref.preferenceId.startsWith('MOCK-');
    const updatedOrder = await this.ordersService.storePreference(orderId, pref.preferenceId, isMock);
    return { order: updatedOrder, initPoint: pref.initPoint, sandboxInitPoint: pref.sandboxInitPoint };
  }

  @Get(':paymentId/status')
  @UseGuards(AuthGuard('jwt'))
  getStatus(@Param('paymentId') paymentId: string) {
    return this.paymentsService.getPaymentStatus(paymentId);
  }

  /** Mercado Pago calls this webhook — no JWT, MP calls directly */
  @Post('webhook')
  async webhook(@Body() body: any) {
    if (body.type !== 'payment' || !body.data?.id) return { received: true };
    try {
      const status = await this.paymentsService.getPaymentStatus(String(body.data.id));
      if (status.status === 'approved' && status.orderId) {
        await this.ordersService.markPaidByOrderId(status.orderId, status.id);
      }
    } catch (err) {
      this.logger.error('Webhook processing error', err);
    }
    return { received: true };
  }
}
