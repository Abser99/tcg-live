import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShippingQuote, ShippingLabel } from './dto/quote-shipping.dto';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);
  private readonly apiBase = 'https://api.enviosperros.com/v3';
  private readonly useMock: boolean;

  constructor(private readonly config: ConfigService) {
    this.useMock = !config.get<string>('ENVIOSPERROS_TOKEN');
    if (this.useMock) {
      this.logger.warn('ENVIOSPERROS_TOKEN not set — using mock shipping data');
    }
  }

  async getQuotes(params: {
    originZip: string;
    destinationZip: string;
    weightKg: number;
    items: number;
  }): Promise<ShippingQuote[]> {
    if (this.useMock) return this.mockQuotes(params.weightKg, params.items);

    // Envíosperros v3: POST /quotes
    // When you have the token, remove this block and uncomment the real call below
    // const token = await this.getToken();
    // const res = await fetch(`${this.apiBase}/quotes`, {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     origin:      { zip: params.originZip },
    //     destination: { zip: params.destinationZip },
    //     package: {
    //       weight: params.weightKg,
    //       height: Math.ceil(params.items * 0.4),
    //       width:  10,
    //       length: 7,
    //     },
    //     quantity: 1,
    //   }),
    // });
    // const data = await res.json();
    // return data.map(this.mapQuote);

    return this.mockQuotes(params.weightKg, params.items);
  }

  async createLabel(params: {
    carrierId: string;
    originZip: string;
    destinationZip: string;
    weightKg: number;
  }): Promise<ShippingLabel> {
    if (this.useMock) return this.mockLabel(params.carrierId);

    // Envíosperros v3: POST /shipments
    // const token = await this.getToken();
    // const res = await fetch(`${this.apiBase}/shipments`, {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     carrier:  params.carrierId,
    //     origin:      { zip: params.originZip },
    //     destination: { zip: params.destinationZip },
    //     package: { weight: params.weightKg, height: 5, width: 10, length: 7 },
    //   }),
    // });
    // const data = await res.json();
    // return { carrier: data.carrier, trackingNumber: data.tracking_number, labelUrl: data.label_url, priceCents: data.price };

    return this.mockLabel(params.carrierId);
  }

  // -- Mock implementations --------------------------------------------------

  private mockQuotes(weightKg: number, items: number): ShippingQuote[] {
    const base = Math.round((weightKg * 1000 + items * 200) * 0.8);
    return [
      { carrierId: 'jt',       carrier: 'J&T Express',    service: 'Estándar',  priceCents: base,              estimatedDays: 6 },
      { carrierId: 'redpack',  carrier: 'RedPack',         service: 'Express',   priceCents: base + 2000,       estimatedDays: 3 },
      { carrierId: 'estafeta', carrier: 'Estafeta',        service: 'Next Day',  priceCents: base + 5000,       estimatedDays: 1 },
    ];
  }

  private mockLabel(carrierId: string): ShippingLabel {
    const map: Record<string, string> = { jt: 'J&T Express', redpack: 'RedPack', estafeta: 'Estafeta' };
    const tracking = `MOCK${Date.now()}`;
    const basePrices: Record<string, number> = { jt: 8500, redpack: 10500, estafeta: 13500 };
    return {
      carrier:        map[carrierId] ?? carrierId,
      trackingNumber: tracking,
      labelUrl:       `https://example.com/labels/${tracking}.pdf`,
      priceCents:     basePrices[carrierId] ?? 9000,
    };
  }
}
