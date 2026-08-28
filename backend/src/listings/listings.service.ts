import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Listing, ListingStatus } from './entities/listing.entity';
import { ListingOffer, OfferStatus } from './entities/listing-offer.entity';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { OrdersService } from '../orders/orders.service';
import { Order } from '../orders/entities/order.entity';

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(Listing) private repo: Repository<Listing>,
    @InjectRepository(ListingOffer) private offersRepo: Repository<ListingOffer>,
    private readonly ordersService: OrdersService,
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
    if (!listing) throw new NotFoundException('Venta no encontrada');
    return listing;
  }

  private readonly MAX_ACTIVE = 25;

  async create(dto: CreateListingDto, sellerId: string) {
    const activeCount = await this.repo.count({ where: { sellerId, status: ListingStatus.ACTIVE } });
    if (activeCount >= this.MAX_ACTIVE) {
      throw new BadRequestException(`Solo puedes tener hasta ${this.MAX_ACTIVE} artículos activos de compra directa.`);
    }
    const listing = this.repo.create({ ...dto, sellerId, status: ListingStatus.ACTIVE });
    return this.repo.save(listing);
  }

  async update(id: string, sellerId: string, dto: UpdateListingDto) {
    const listing = await this.findOne(id);
    if (listing.sellerId !== sellerId) throw new ForbiddenException();
    Object.assign(listing, dto);
    return this.repo.save(listing);
  }

  /**
   * Atomically take a listing out of the catalogue for its owner.
   *
   * markSold() just overwrites the status, so calling it twice hands the same card to
   * two people. This only succeeds while the listing is still ACTIVE, which is the same
   * guard buy() uses against two buyers racing for one card.
   */
  async claim(id: string, sellerId: string) {
    const listing = await this.findOne(id);
    if (listing.sellerId !== sellerId) throw new ForbiddenException('Ese artículo no es tuyo');
    const result = await this.repo.update(
      { id, status: ListingStatus.ACTIVE },
      { status: ListingStatus.SOLD },
    );
    if (result.affected === 0) {
      throw new ConflictException('Ese artículo ya se entregó o no está disponible');
    }
    return listing;
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

  async buy(listingId: string, buyerId: string): Promise<Order> {
    const listing = await this.repo.findOne({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Venta no encontrada');
    if (listing.sellerId === buyerId) throw new ForbiddenException('No puedes comprar tu propia carta');

    // Atomic status transition — prevents two buyers from claiming the same listing
    const result = await this.repo.update(
      { id: listingId, status: ListingStatus.ACTIVE },
      { status: ListingStatus.SOLD },
    );
    if (result.affected === 0) {
      throw new ConflictException('Esta carta ya fue comprada o no está disponible');
    }

    return this.ordersService.createForListing({
      listingId,
      listingTitle: listing.title,
      priceCents: listing.price, // already stored in MXN cents
      sellerId: listing.sellerId,
      buyerId,
      imageUrls: listing.imageUrls ?? undefined,
    });
  }

  myListings(sellerId: string) {
    return this.repo.find({ where: { sellerId }, order: { createdAt: 'DESC' } });
  }

  async createOffer(listingId: string, buyerId: string, dto: CreateOfferDto): Promise<ListingOffer> {
    const listing = await this.findOne(listingId);
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('La venta no está activa');
    }
    if (listing.sellerId === buyerId) {
      throw new ForbiddenException('No puedes hacer oferta en tu propia venta');
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
