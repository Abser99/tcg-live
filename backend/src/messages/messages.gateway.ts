import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect,
  SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { MessagesService } from './messages.service';
import { OrdersService } from '../orders/orders.service';
import { WsJwtGuard } from '../common/guards/ws-jwt.guard';
import { extractWsToken } from '../common/utils/ws.utils';

@WebSocketGateway({
  cors: {
    // Mirror the allowlist from auctions.gateway.ts — WEB_URL in production,
    // all localhost origins and *.vercel.app in development.
    origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
      const webUrl = (process.env.WEB_URL ?? '').replace(/\/$/, '');
      if (
        !origin ||
        !webUrl ||
        origin === webUrl ||
        /\.vercel\.app$/.test(origin) ||
        /^http:\/\/localhost(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  },
  namespace: '/messages',
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly messagesService: MessagesService,
    private readonly ordersService: OrdersService,
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
    // rooms are cleaned up automatically by socket.io on disconnect
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('messages:join')
  async handleJoin(@MessageBody() orderId: string, @ConnectedSocket() client: Socket) {
    const userId: string = client.data.user?.id;
    const order = await this.ordersService.findById(orderId);
    if (!order || (order.buyerId !== userId && order.sellerId !== userId)) {
      client.emit('error', { message: 'No autorizado' });
      return;
    }
    client.join(`order:${orderId}`);
    return { event: 'messages:joined', data: orderId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('messages:leave')
  handleLeave(@MessageBody() orderId: string, @ConnectedSocket() client: Socket) {
    client.leave(`order:${orderId}`);
    return { event: 'messages:left', data: orderId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('messages:send')
  async handleSend(
    @MessageBody() payload: { orderId: string; body: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    const body = String(payload.body ?? '').trim().slice(0, 500);
    if (!body || !payload.orderId) return;

    try {
      const message = await this.messagesService.save(
        payload.orderId, user.id, user.username, body,
      );
      this.server.to(`order:${payload.orderId}`).emit('messages:new', message);
    } catch {
      // swallow auth/not-found errors silently — client sent invalid orderId
    }
  }
}
