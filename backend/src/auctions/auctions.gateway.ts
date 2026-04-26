import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { WsJwtGuard } from '../common/guards/ws-jwt.guard';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/auctions' })
export class AuctionsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow('jwt.secret'),
      });
      const user = await this.usersService.findById(payload.sub);
      client.data.user = user;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // rooms are cleaned up automatically by socket.io on disconnect
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join-auction')
  handleJoin(@MessageBody() auctionId: string, @ConnectedSocket() client: Socket) {
    client.join(`auction:${auctionId}`);
    return { event: 'joined', data: auctionId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leave-auction')
  handleLeave(@MessageBody() auctionId: string, @ConnectedSocket() client: Socket) {
    client.leave(`auction:${auctionId}`);
    return { event: 'left', data: auctionId };
  }

  emitBidPlaced(auctionId: string, payload: BidPlacedPayload) {
    this.server.to(`auction:${auctionId}`).emit('bid:placed', payload);
  }

  emitItemClosed(auctionId: string, payload: ItemClosedPayload) {
    this.server.to(`auction:${auctionId}`).emit('item:closed', payload);
  }

  emitAuctionStarted(auctionId: string, payload: AuctionStartedPayload) {
    this.server.to(`auction:${auctionId}`).emit('auction:started', payload);
  }

  emitAuctionEnded(auctionId: string) {
    this.server.to(`auction:${auctionId}`).emit('auction:ended', { auctionId });
  }
}

export interface BidPlacedPayload {
  auctionId: string;
  itemId: string;
  bidId: string;
  bidderId: string;
  bidderUsername: string;
  amount: number;
  timestamp: string;
}

export interface ItemClosedPayload {
  auctionId: string;
  itemId: string;
  status: string;
  winnerId: string | null;
  finalPrice: number;
  nextItemId: string | null;
}

export interface AuctionStartedPayload {
  auctionId: string;
  firstItemId: string;
}
