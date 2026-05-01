import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuctionTemplate } from './entities/auction-template.entity';
import { AuctionsService } from '../auctions/auctions.service';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(AuctionTemplate)
    private readonly repo: Repository<AuctionTemplate>,
    private readonly auctionsService: AuctionsService,
  ) {}

  async findMySaved(sellerId: string): Promise<AuctionTemplate[]> {
    return this.repo.find({ where: { sellerId }, order: { createdAt: 'DESC' } });
  }

  async fromAuction(auctionId: string, sellerId: string): Promise<AuctionTemplate> {
    const auction = await this.auctionsService.findOne(auctionId);
    if (!auction) throw new NotFoundException('Subasta no encontrada');
    if (auction.sellerId !== sellerId) throw new ForbiddenException();

    const items = (auction.items ?? []).map(i => ({
      cardName:     i.cardName,
      cardSet:      i.cardSet ?? undefined,
      cardNumber:   i.cardNumber ?? undefined,
      condition:    i.condition,
      startingPrice: i.startingPrice,
      reservePrice: i.reservePrice ?? undefined,
      imageUrls:    i.imageUrls ?? undefined,
    }));

    return this.repo.save(
      this.repo.create({
        sellerId,
        name:  auction.title,
        title: auction.title,
        game:  auction.game,
        description: auction.description ?? undefined,
        items,
      }),
    );
  }

  async delete(id: string, sellerId: string): Promise<void> {
    const template = await this.repo.findOne({ where: { id } });
    if (!template) throw new NotFoundException();
    if (template.sellerId !== sellerId) throw new ForbiddenException();
    await this.repo.delete(id);
  }
}
