import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { WsJwtGuard } from '../common/guards/ws-jwt.guard';
import { extractWsToken } from '../common/utils/ws.utils';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/auctions' })
export class AuctionsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  /** auctionId → Set of socket IDs currently viewing */
  private readonly viewers = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = extractWsToken(client);
      if (!token) { client.disconnect(); return; }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow('jwt.secret'),
      });
      client.data.user = await this.usersService.findById(payload.sub);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    for (const [auctionId, set] of this.viewers.entries()) {
      if (set.delete(client.id)) {
        this.emitViewerCount(auctionId);
      }
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join-auction')
  handleJoin(@MessageBody() auctionId: string, @ConnectedSocket() client: Socket) {
    client.join(`auction:${auctionId}`);
    if (!this.viewers.has(auctionId)) this.viewers.set(auctionId, new Set());
    this.viewers.get(auctionId)!.add(client.id);
    this.emitViewerCount(auctionId);
    return { event: 'joined', data: auctionId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leave-auction')
  handleLeave(@MessageBody() auctionId: string, @ConnectedSocket() client: Socket) {
    client.leave(`auction:${auctionId}`);
    this.viewers.get(auctionId)?.delete(client.id);
    this.emitViewerCount(auctionId);
    return { event: 'left', data: auctionId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('chat:send')
  handleChat(@MessageBody() text: string, @ConnectedSocket() client: Socket) {
    const user = client.data.user;
    const auctionId = this.getAuctionRoom(client);
    if (!auctionId) return;

    const message = String(text ?? '').trim().slice(0, 200);
    if (!message) return;

    this.server.to(`auction:${auctionId}`).emit('chat:message', {
      userId: user.id,
      username: user.username,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('reaction:send')
  handleReaction(@MessageBody() emoji: string, @ConnectedSocket() client: Socket) {
    const ALLOWED = ['🔥', '❤️', '💎', '🎯', '😮'];
    if (!ALLOWED.includes(emoji)) return;

    const user = client.data.user;
    const auctionId = this.getAuctionRoom(client);
    if (!auctionId) return;

    this.server.to(`auction:${auctionId}`).emit('reaction', {
      id: `${Date.now()}-${Math.random()}`,
      userId: user.id,
      username: user.username,
      emoji,
    });
  }

  private getAuctionRoom(client: Socket): string | null {
    const rooms = Array.from(client.rooms).filter((r) => r.startsWith('auction:'));
    return rooms[0]?.replace('auction:', '') ?? null;
  }

  // ── server → client emitters ──────────────────────────────────────────────

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

  private emitViewerCount(auctionId: string) {
    const count = this.viewers.get(auctionId)?.size ?? 0;
    this.server.to(`auction:${auctionId}`).emit('viewer:count', { count });
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
  closesAt: string | null;
}

export interface ItemClosedPayload {
  auctionId: string;
  itemId: string;
  status: string;
  winnerId: string | null;
  finalPrice: number;
  nextItemId: string | null;
  nextClosesAt: string | null;
}

export interface AuctionStartedPayload {
  auctionId: string;
  firstItemId: string;
}
