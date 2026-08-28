import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Auction } from './entities/auction.entity';
import { AuctionItem } from './entities/auction-item.entity';
import { Bid } from './entities/bid.entity';
import { MaxBid } from './entities/max-bid.entity';
import { LiveSanction } from './entities/live-sanction.entity';
import { LiveAttendance } from './entities/live-attendance.entity';
import { Raffle } from './entities/raffle.entity';
import { AuctionsService } from './auctions.service';
import { AuctionsController } from './auctions.controller';
import { AuctionsGateway } from './auctions.gateway';
import { UsersModule } from '../users/users.module';
import { LivekitModule } from '../livekit/livekit.module';
import { ListingsModule } from '../listings/listings.module';
import { OrdersModule } from '../orders/orders.module';
import { WatchlistModule } from '../watchlist/watchlist.module';
import { FollowsModule } from '../follows/follows.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WsJwtGuard } from '../common/guards/ws-jwt.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Auction, AuctionItem, Bid, MaxBid, LiveSanction, LiveAttendance, Raffle]),
    UsersModule,
    LivekitModule,
    forwardRef(() => ListingsModule),
    OrdersModule,
    WatchlistModule,
    FollowsModule,
    NotificationsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: { expiresIn: config.getOrThrow<string>('jwt.expiresIn') as any },
      }),
    }),
  ],
  providers: [AuctionsService, AuctionsGateway, WsJwtGuard],
  controllers: [AuctionsController],
  exports: [AuctionsService],
})
export class AuctionsModule {}
