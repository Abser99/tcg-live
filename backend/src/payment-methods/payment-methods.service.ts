import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod, PaymentMethodType } from './entities/payment-method.entity';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectRepository(PaymentMethod)
    private readonly repo: Repository<PaymentMethod>,
  ) {}

  async findByUser(userId: string): Promise<PaymentMethod[]> {
    return this.repo.find({ where: { userId }, order: { isDefault: 'DESC', createdAt: 'ASC' } });
  }

  async create(userId: string, dto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    let last4: string | undefined;
    let brand: string | undefined;
    let nickname: string;

    if (dto.type === PaymentMethodType.CARD) {
      const num = dto.cardNumber!.replace(/\s/g, '');
      last4 = num.slice(-4);
      brand = this.detectBrand(num);
      nickname = `${this.capitalize(brand)} ****${last4}`;
    } else if (dto.type === PaymentMethodType.OXXO) {
      nickname = 'Pago en OXXO';
    } else {
      nickname = 'Transferencia SPEI';
    }

    // When integrating Mercado Pago: call MP API here to tokenize the card
    // and store the token as externalId. Never persist raw card number.

    const existing = await this.repo.find({ where: { userId } });
    const isDefault = existing.length === 0;

    const method = this.repo.create({
      userId,
      type: dto.type,
      nickname,
      last4,
      brand,
      expiry: dto.expiry,
      isDefault,
    });
    return this.repo.save(method);
  }

  async setDefault(id: string, userId: string): Promise<PaymentMethod> {
    const method = await this.repo.findOne({ where: { id, userId } });
    if (!method) throw new NotFoundException();
    await this.repo.update({ userId }, { isDefault: false });
    method.isDefault = true;
    return this.repo.save(method);
  }

  async remove(id: string, userId: string): Promise<void> {
    const method = await this.repo.findOne({ where: { id, userId } });
    if (!method) throw new NotFoundException();
    await this.repo.remove(method);
    // If deleted method was default, promote the first remaining one
    if (method.isDefault) {
      const first = await this.repo.findOne({ where: { userId }, order: { createdAt: 'ASC' } });
      if (first) { first.isDefault = true; await this.repo.save(first); }
    }
  }

  async hasPaymentMethod(userId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { userId } });
    return count > 0;
  }

  private detectBrand(num: string): string {
    if (/^4/.test(num)) return 'visa';
    if (/^5[1-5]/.test(num)) return 'mastercard';
    if (/^3[47]/.test(num)) return 'amex';
    return 'other';
  }

  private capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
