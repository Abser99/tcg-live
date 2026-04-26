import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
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
import { User } from './users/user.entity';
import { Auction } from './auctions/entities/auction.entity';
import { AuctionItem } from './auctions/entities/auction-item.entity';
import { Bid } from './auctions/entities/bid.entity';
import { SellerApplication } from './seller-applications/seller-application.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig, redisConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        database: config.get('database.name'),
        username: config.get('database.user'),
        password: config.get('database.password'),
        entities: [User, Auction, AuctionItem, Bid, SellerApplication],
        synchronize: true, // dev only — swap for migrations before production
        logging: process.env.NODE_ENV === 'development',
      }),
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
  ],
})
export class AppModule {}
