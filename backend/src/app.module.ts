import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { createKeyv } from '@keyv/redis';
import { CacheableMemory } from 'cacheable';
import { Keyv } from 'keyv';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AuctionsModule } from './auctions/auctions.module';
import { SellerApplicationsModule } from './seller-applications/seller-applications.module';
import { CardsModule } from './cards/cards.module';
import { OrdersModule } from './orders/orders.module';
import { ShippingModule } from './shipping/shipping.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { DisputesModule } from './disputes/disputes.module';
import { Dispute } from './disputes/entities/dispute.entity';
import { WatchlistModule } from './watchlist/watchlist.module';
import { WatchlistItem } from './watchlist/entities/watchlist-item.entity';
import { MessagesModule } from './messages/messages.module';
import { Message } from './messages/entities/message.entity';
import { FollowsModule } from './follows/follows.module';
import { FollowedSeller } from './follows/entities/followed-seller.entity';
import { TemplatesModule } from './templates/templates.module';
import { AuctionTemplate } from './templates/entities/auction-template.entity';
import { ListingsModule } from './listings/listings.module';
import { Listing } from './listings/entities/listing.entity';
import { ListingOffer } from './listings/entities/listing-offer.entity';
import { SellerDocumentsModule } from './seller-documents/seller-documents.module';
import { HealthController } from './health.controller';
import { SellerDocument } from './seller-documents/seller-document.entity';
import { User } from './users/user.entity';
import { Auction } from './auctions/entities/auction.entity';
import { AuctionItem } from './auctions/entities/auction-item.entity';
import { Bid } from './auctions/entities/bid.entity';
import { SellerApplication } from './seller-applications/seller-application.entity';
import { MaxBid } from './auctions/entities/max-bid.entity';
import { Order } from './orders/entities/order.entity';
import { OrderItem } from './orders/entities/order-item.entity';
import { PaymentMethod } from './payment-methods/entities/payment-method.entity';
import { PushToken } from './notifications/entities/push-token.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig, redisConfig],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]), // 120 req/min globally
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): any => {
        const dbUrl = config.get<string>('database.url');
        return {
          type: 'postgres',
          ...(dbUrl
            ? { url: dbUrl }
            : {
                host: config.get<string>('database.host'),
                port: config.get<number>('database.port'),
                database: config.get<string>('database.name'),
                username: config.get<string>('database.user'),
                password: config.get<string>('database.password'),
              }),
          entities: [User, Auction, AuctionItem, Bid, SellerApplication, MaxBid, Order, OrderItem, PaymentMethod, PushToken, Dispute, WatchlistItem, Message, FollowedSeller, AuctionTemplate, Listing, ListingOffer, SellerDocument],
          synchronize: process.env.NODE_ENV !== 'production',
          migrations: [join(__dirname, '..', 'migrations', '*.js')],
          migrationsRun: process.env.NODE_ENV === 'production',
          ssl: dbUrl ? { rejectUnauthorized: false } : false,
          logging: process.env.NODE_ENV === 'development',
        };
      },
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        stores: [
          new Keyv({ store: new CacheableMemory({ ttl: 30000, lruSize: 5000 }) }),
          createKeyv(`redis://${config.get('redis.host')}:${config.get('redis.port')}`),
        ],
      }),
    }),
    UsersModule,
    AuthModule,
    AuctionsModule,
    SellerApplicationsModule,
    CardsModule,
    OrdersModule,
    ShippingModule,
    PaymentMethodsModule,
    NotificationsModule,
    PaymentsModule,
    DisputesModule,
    WatchlistModule,
    MessagesModule,
    FollowsModule,
    TemplatesModule,
    ListingsModule,
    SellerDocumentsModule,
    TypeOrmModule.forFeature([User, Auction, Bid]),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
