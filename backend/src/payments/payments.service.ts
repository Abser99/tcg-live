import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

export interface PaymentPreference {
  preferenceId: string;
  initPoint: string;
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
  private readonly client: MercadoPagoConfig | null;

  constructor(private readonly config: ConfigService) {
    const accessToken = config.get<string>('MERCADOPAGO_ACCESS_TOKEN');
    this.useMock = !accessToken;
    if (this.useMock) {
      this.logger.warn('MERCADOPAGO_ACCESS_TOKEN not set — using mock payment data');
      this.client = null;
    } else {
      this.client = new MercadoPagoConfig({
        accessToken: accessToken!,
        options: { timeout: 10000 },
      });
    }
  }

  async createPreference(params: {
    orderId: string;
    items: { title: string; quantity: number; unitPrice: number }[];
    buyerEmail: string;
    backUrls?: { success: string; failure: string; pending: string };
  }): Promise<PaymentPreference> {
    if (this.useMock) return this.mockPreference(params.orderId);

    try {
      const preference = new Preference(this.client!);
      const result = await preference.create({
        body: {
          external_reference: params.orderId,
          items: params.items.map((i, idx) => ({
            id: String(idx + 1),
            title: i.title,
            quantity: i.quantity,
            unit_price: i.unitPrice / 100, // SDK expects MXN pesos, not cents
            currency_id: 'MXN',
          })),
          payer: { email: params.buyerEmail },
          back_urls: params.backUrls ?? {
            success: `${this.config.get('WEB_URL', 'http://localhost:3001')}/pago/exitoso`,
            failure: `${this.config.get('WEB_URL', 'http://localhost:3001')}/pago/error`,
            pending: `${this.config.get('WEB_URL', 'http://localhost:3001')}/pago/pendiente`,
          },
          auto_return: 'approved',
          notification_url: `${this.config.get('BACKEND_URL', 'http://localhost:3000')}/api/payments/webhook`,
        },
      });

      if (!result.id) {
        this.logger.error('MP preference creation returned no id', result);
        if (this.config.get('NODE_ENV') === 'production') {
          throw new Error('El proveedor de pagos no está disponible. Intenta de nuevo.');
        }
        return this.mockPreference(params.orderId);
      }

      return {
        preferenceId: result.id,
        initPoint: result.init_point!,
        sandboxInitPoint: result.sandbox_init_point!,
      };
    } catch (err) {
      this.logger.error('MP createPreference error', err);
      if (this.config.get('NODE_ENV') === 'production') throw err;
      return this.mockPreference(params.orderId);
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    if (this.useMock) return this.mockStatus(paymentId);

    try {
      const payment = new Payment(this.client!);
      const data = await payment.get({ id: paymentId });
      return {
        id: String(data.id),
        status: data.status as PaymentStatus['status'],
        statusDetail: data.status_detail ?? '',
        amount: Math.round((data.transaction_amount ?? 0) * 100), // convert pesos → cents
        orderId: data.external_reference ?? null,
      };
    } catch (err) {
      this.logger.error(`MP getPaymentStatus error for paymentId=${paymentId}`, err);
      throw err;
    }
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
