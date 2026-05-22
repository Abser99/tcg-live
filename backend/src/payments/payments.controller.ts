import { Body, Controller, Get, Headers, Param, Post, UseGuards, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PaymentsService } from './payments.service';
import { OrdersService } from '../orders/orders.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { Order } from '../orders/entities/order.entity';

function verifyMpSignature(secret: string, headers: Record<string, string>, paymentId: string): boolean {
  const sig = headers['x-signature'] ?? '';
  const reqId = headers['x-request-id'] ?? '';
  const tsMatch = sig.match(/ts=(\d+)/);
  const v1Match = sig.match(/v1=([a-f0-9]+)/);
  if (!tsMatch || !v1Match) return false;
  const message = `id:${paymentId};request-id:${reqId};ts:${tsMatch[1]}`;
  const hash = createHmac('sha256', secret).update(message).digest('hex');
  return hash === v1Match[1];
}

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly ordersService: OrdersService,
    private readonly config: ConfigService,
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
  async webhook(@Body() body: any, @Headers() headers: Record<string, string>) {
    if (body.type !== 'payment' || !body.data?.id) return { received: true };

    const secret = this.config.get<string>('MERCADOPAGO_WEBHOOK_SECRET');
    if (secret && !verifyMpSignature(secret, headers, String(body.data.id))) {
      this.logger.warn('Webhook rejected: invalid MP signature');
      return { received: true };
    }

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
