import { Body, Controller, Get, Param, Post, UseGuards, Headers, RawBodyRequest, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentsService } from './payments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('preference')
  @UseGuards(AuthGuard('jwt'))
  createPreference(
    @CurrentUser() user: User,
    @Body() body: { orderId: string; items: { title: string; quantity: number; unitPrice: number }[] },
  ) {
    return this.paymentsService.createPreference({
      orderId: body.orderId,
      items: body.items,
      buyerEmail: user.email,
    });
  }

  @Get(':paymentId/status')
  @UseGuards(AuthGuard('jwt'))
  getStatus(@Param('paymentId') paymentId: string) {
    return this.paymentsService.getPaymentStatus(paymentId);
  }

  // Mercado Pago calls this webhook when a payment is processed
  // No JWT guard — MP calls this directly
  @Post('webhook')
  async webhook(@Body() body: any) {
    // When integrating MP:
    // 1. Validate X-Signature header
    // 2. Fetch payment details from MP API
    // 3. If approved: update Order.paymentStatus, send push notification to seller
    // 4. If rejected: notify buyer
    return { received: true };
  }
}
