import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PaymentPreference {
  preferenceId: string;
  initPoint: string;  // URL to open MP checkout
  sandboxInitPoint: string;
}

export interface PaymentStatus {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  statusDetail: string;
  amount: number; // MXN cents
  orderId: string | null; // external_reference from MP
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly useMock: boolean;
  private readonly accessToken: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.accessToken = config.get<string>('MERCADOPAGO_ACCESS_TOKEN');
    this.useMock = !this.accessToken;
    if (this.useMock) {
      this.logger.warn('MERCADOPAGO_ACCESS_TOKEN not set — using mock payment data');
    }
  }

  async createPreference(params: {
    orderId: string;
    items: { title: string; quantity: number; unitPrice: number }[];
    buyerEmail: string;
    backUrls?: { success: string; failure: string; pending: string };
  }): Promise<PaymentPreference> {
    if (this.useMock) return this.mockPreference(params.orderId);

    // Mercado Pago Checkout API v2
    // Uncomment when you have the access token:
    //
    // const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    //   method: 'POST',
    //   headers: {
    //     Authorization: `Bearer ${this.accessToken}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     external_reference: params.orderId,
    //     items: params.items.map(i => ({
    //       title: i.title,
    //       quantity: i.quantity,
    //       unit_price: i.unitPrice / 100, // MP uses MXN pesos, not cents
    //       currency_id: 'MXN',
    //     })),
    //     payer: { email: params.buyerEmail },
    //     back_urls: params.backUrls ?? {
    //       success: 'tcglive://payment/success',
    //       failure: 'tcglive://payment/failure',
    //       pending: 'tcglive://payment/pending',
    //     },
    //     auto_return: 'approved',
    //     notification_url: `${process.env.BACKEND_URL}/payments/webhook`,
    //   }),
    // });
    // const data = await res.json();
    // return {
    //   preferenceId: data.id,
    //   initPoint: data.init_point,
    //   sandboxInitPoint: data.sandbox_init_point,
    // };

    return this.mockPreference(params.orderId);
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    if (this.useMock) return this.mockStatus(paymentId);

    // const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    //   headers: { Authorization: `Bearer ${this.accessToken}` },
    // });
    // const data = await res.json();
    // return {
    //   id: String(data.id),
    //   status: data.status,
    //   statusDetail: data.status_detail,
    //   amount: Math.round(data.transaction_amount * 100),
    // };

    return this.mockStatus(paymentId);
  }

  // -- Mock implementations --------------------------------------------------

  private mockPreference(orderId: string): PaymentPreference {
    return {
      preferenceId: `MOCK-PREF-${orderId.slice(0, 8)}`,
      initPoint:        `https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=MOCK-${orderId}`,
      sandboxInitPoint: `https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=MOCK-${orderId}`,
    };
  }

  private mockStatus(paymentId: string): PaymentStatus {
    return {
      id: paymentId,
      status: 'approved',
      statusDetail: 'accredited',
      amount: 0,
      orderId: null,
    };
  }
}
