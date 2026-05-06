import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Listing, ListingStatus } from './entities/listing.entity';
import { ListingOffer, OfferStatus } from './entities/listing-offer.entity';
import { CreateListingDto } from './dto/create-listing.dto';
import { CreateOfferDto } from './dto/create-offer.dto';

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(Listing) private repo: Repository<Listing>,
    @InjectRepository(ListingOffer) private offersRepo: Repository<ListingOffer>,
  ) {}

  findAll(game?: string, q?: string) {
    const qb = this.repo.createQueryBuilder('l')
      .leftJoinAndSelect('l.seller', 's')
      .where('l.status = :status', { status: ListingStatus.ACTIVE });
    if (game) qb.andWhere('l.game = :game', { game });
    if (q) qb.andWhere('l.title ILIKE :q', { q: `%${q}%` });
    return qb.orderBy('l.createdAt', 'DESC').getMany();
  }

  async findOne(id: string) {
    const listing = await this.repo.findOne({ where: { id }, relations: ['seller'] });
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  create(dto: CreateListingDto, sellerId: string) {
    const listing = this.repo.create({ ...dto, sellerId, status: ListingStatus.ACTIVE });
    return this.repo.save(listing);
  }

  async markSold(id: string, sellerId: string) {
    const listing = await this.findOne(id);
    if (listing.sellerId !== sellerId) throw new ForbiddenException();
    listing.status = ListingStatus.SOLD;
    return this.repo.save(listing);
  }

  async cancel(id: string, sellerId: string) {
    const listing = await this.findOne(id);
    if (listing.sellerId !== sellerId) throw new ForbiddenException();
    listing.status = ListingStatus.CANCELLED;
    return this.repo.save(listing);
  }

  myListings(sellerId: string) {
    return this.repo.find({ where: { sellerId }, order: { createdAt: 'DESC' } });
  }

  async createOffer(listingId: string, buyerId: string, dto: CreateOfferDto): Promise<ListingOffer> {
    const listing = await this.findOne(listingId);
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('Listing is not active');
    }
    if (listing.sellerId === buyerId) {
      throw new ForbiddenException('Cannot make an offer on your own listing');
    }
    const existing = await this.offersRepo.findOne({
      where: { listingId, buyerId, status: OfferStatus.PENDING },
    });
    if (existing) {
      throw new BadRequestException('Ya tienes una oferta pendiente para este listado');
    }
    const offer = this.offersRepo.create({ listingId, buyerId, amount: dto.amount, message: dto.message ?? null });
    return this.offersRepo.save(offer);
  }

  async getOffersForListing(listingId: string, sellerId: string): Promise<ListingOffer[]> {
    const listing = await this.findOne(listingId);
    if (listing.sellerId !== sellerId) throw new ForbiddenException();
    return this.offersRepo.find({
      where: { listingId },
      relations: ['buyer'],
      order: { createdAt: 'DESC' },
    });
  }

  async respondToOffer(offerId: string, sellerId: string, accept: boolean): Promise<ListingOffer> {
    const offer = await this.offersRepo.findOne({ where: { id: offerId }, relations: ['listing'] });
    if (!offer) throw new NotFoundException('Oferta no encontrada');
    if (offer.listing.sellerId !== sellerId) throw new ForbiddenException();
    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException('Esta oferta ya fue respondida');
    }
    offer.status = accept ? OfferStatus.ACCEPTED : OfferStatus.DECLINED;
    if (accept) {
      offer.listing.status = ListingStatus.SOLD;
      await this.repo.save(offer.listing);
    }
    return this.offersRepo.save(offer);
  }

  async withdrawOffer(offerId: string, buyerId: string): Promise<void> {
    const offer = await this.offersRepo.findOne({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Oferta no encontrada');
    if (offer.buyerId !== buyerId) throw new ForbiddenException();
    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException('No se puede retirar una oferta ya respondida');
    }
    offer.status = OfferStatus.WITHDRAWN;
    await this.offersRepo.save(offer);
  }

  async getMyOffers(buyerId: string): Promise<ListingOffer[]> {
    return this.offersRepo.find({
      where: { buyerId },
      relations: ['listing', 'listing.seller'],
      order: { createdAt: 'DESC' },
    });
  }
}
