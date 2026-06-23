import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, UseGuards, Logger } from '@nestjs/common';
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
  async getStatus(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: User,
  ) {
    const status = await this.paymentsService.getPaymentStatus(paymentId);
    // Verify the payment belongs to the requesting user (buyer or seller on the order).
    if (status.orderId) {
      const order = await this.ordersService.findById(status.orderId);
      if (order && order.buyerId !== user.id && order.sellerId !== user.id) {
        throw new ForbiddenException('No tienes acceso a este pago');
      }
    }
    return status;
  }

  /** Mercado Pago calls this webhook — no JWT, MP calls directly */
  @Post('webhook')
  async webhook(@Body() body: any, @Headers() headers: Record<string, string>) {
    if (body.type !== 'payment' || !body.data?.id) return { received: true };

    const secret = this.config.get<string>('MERCADOPAGO_WEBHOOK_SECRET');

    // In production, reject webhooks that lack a valid signature when a
    // secret is configured. Log a warning but always return 200 so MP
    // doesn't keep retrying — we just don't process the invalid payload.
    if (secret) {
      if (!verifyMpSignature(secret, headers, String(body.data.id))) {
        this.logger.warn('Webhook rejected: invalid MP signature');
        return { received: true };
      }
    } else if (this.config.get('NODE_ENV') === 'production') {
      // Webhook secret is mandatory in production — refuse unsigned requests
      this.logger.error(
        'MERCADOPAGO_WEBHOOK_SECRET is not set in production. ' +
        'Ignoring webhook to prevent unauthenticated payment confirmation.',
      );
      return { received: true };
    }

    try {
      const status = await this.paymentsService.getPaymentStatus(String(body.data.id));
      if (status.status === 'approved' && status.orderId) {
        // Verify the payment amount matches the expected order total before marking paid.
        // status.amount is already in MXN cents (PaymentsService converts transaction_amount * 100).
        const order = await this.ordersService.findById(status.orderId);
        if (order && order.totalCents !== null) {
          if (Math.abs(status.amount - order.totalCents) > 1) {
            this.logger.error(
              `Webhook amount mismatch for order ${status.orderId}: ` +
              `expected ${order.totalCents} cents, got ${status.amount} cents`,
            );
            return { received: true }; // acknowledge but do NOT mark paid
          }
        }
        await this.ordersService.markPaidByOrderId(status.orderId, status.id);
      }
    } catch (err) {
      this.logger.error('Webhook processing error', err);
    }
    return { received: true };
  }
}
