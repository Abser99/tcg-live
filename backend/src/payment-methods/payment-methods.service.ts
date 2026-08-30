import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod, PaymentMethodType } from './entities/payment-method.entity';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { brandLabel, checkCardNumber } from './card';

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
      // Per-brand length and check digit, so a typo is caught here rather than by the
      // processor, where it comes back as an opaque decline.
      const check = checkCardNumber(dto.cardNumber ?? '');
      if (!check.ok) throw new BadRequestException(check.reason);
      last4 = check.last4;
      brand = check.brand;
      nickname = `${brandLabel(check.brand)} •${last4}`;
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
      cardholderName: dto.cardholderName?.trim() || null,
      isDefault,
      // Billing address — every part optional, so a card can be saved now and the
      // address filled in when it's first needed.
      billingName: dto.billingName?.trim() || null,
      street:      dto.street?.trim() || null,
      extNumber:   dto.extNumber?.trim() || null,
      intNumber:   dto.intNumber?.trim() || null,
      colonia:     dto.colonia?.trim() || null,
      city:        dto.city?.trim() || null,
      state:       dto.state?.trim() || null,
      zip:         dto.zip?.trim() || null,
    });
    return this.repo.save(method);
  }

  /**
   * Edit a saved card. The number is not among the fields: only its last four digits
   * were ever kept, so a different number is a different card.
   * An empty string clears a field; leaving it out keeps what's there.
   */
  async update(id: string, userId: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethod> {
    const method = await this.repo.findOne({ where: { id, userId } });
    if (!method) throw new NotFoundException('Tarjeta no encontrada');

    const fields: (keyof UpdatePaymentMethodDto)[] = [
      'expiry', 'cardholderName', 'billingName', 'street', 'extNumber',
      'intNumber', 'colonia', 'city', 'state', 'zip',
    ];
    for (const f of fields) {
      if (dto[f] === undefined) continue;
      (method as unknown as Record<string, string | null>)[f] = dto[f]!.trim() || null;
    }
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

}
