import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushToken } from './entities/push-token.entity';
import Expo, { ExpoPushMessage } from 'expo-server-sdk';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly expo = new Expo();

  constructor(
    @InjectRepository(PushToken)
    private readonly tokensRepo: Repository<PushToken>,
  ) {}

  async registerToken(userId: string, token: string, deviceId?: string): Promise<void> {
    if (!Expo.isExpoPushToken(token)) {
      this.logger.warn(`Invalid Expo push token: ${token}`);
      return;
    }
    await this.tokensRepo.upsert(
      { userId, token, deviceId },
      { conflictPaths: ['token'] },
    );
  }

  async removeToken(token: string): Promise<void> {
    await this.tokensRepo.delete({ token });
  }

  async sendToUser(userId: string, notification: { title: string; body: string; data?: Record<string, unknown> }): Promise<void> {
    const tokens = await this.tokensRepo.find({ where: { userId } });
    if (!tokens.length) return;

    const messages: ExpoPushMessage[] = tokens
      .filter(t => Expo.isExpoPushToken(t.token))
      .map(t => ({
        to: t.token,
        sound: 'default' as const,
        title: notification.title,
        body: notification.body,
        data: notification.data ?? {},
      }));

    if (!messages.length) return;

    try {
      const chunks = this.expo.chunkPushNotifications(messages);
      const results = await Promise.allSettled(
        chunks.map(chunk => this.expo.sendPushNotificationsAsync(chunk)),
      );
      // Clean up invalid tokens
      for (const result of results) {
        if (result.status === 'fulfilled') {
          for (const ticket of result.value) {
            if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
              const badToken = messages.find(m => m.to === (ticket as any).expoPushToken)?.to as string;
              if (badToken) await this.removeToken(badToken);
            }
          }
        }
      }
    } catch (err) {
      this.logger.error('Push notification failed', err);
    }
  }

  // Convenience helpers for order events
  async notifyOrderConfirmed(buyerId: string, cardNames: string[]): Promise<void> {
    const preview = cardNames.slice(0, 2).join(', ') + (cardNames.length > 2 ? '...' : '');
    await this.sendToUser(buyerId, {
      title: '📦 Pedido confirmado',
      body: `El vendedor confirmó tu pedido: ${preview}`,
      data: { type: 'order_confirmed' },
    });
  }

  async notifyOrderShipped(buyerId: string, trackingNumber: string, carrier: string): Promise<void> {
    await this.sendToUser(buyerId, {
      title: '🚚 ¡Tu pedido está en camino!',
      body: `${carrier} · Guía: ${trackingNumber}`,
      data: { type: 'order_shipped', trackingNumber },
    });
  }

  async notifyAuctionWin(buyerId: string, cardName: string, finalPrice: number): Promise<void> {
    await this.sendToUser(buyerId, {
      title: '🏆 ¡Ganaste!',
      body: `Obtuviste "${cardName}" por $${(finalPrice / 100).toFixed(2)} MXN`,
      data: { type: 'auction_win' },
    });
  }

  async notifyNewOrder(sellerId: string, buyerUsername: string, itemCount: number): Promise<void> {
    await this.sendToUser(sellerId, {
      title: '🎉 Nueva venta',
      body: `@${buyerUsername} ganó ${itemCount} ${itemCount === 1 ? 'carta' : 'cartas'} en tu subasta`,
      data: { type: 'new_order' },
    });
  }

  async notifyOrderDelivered(sellerId: string, buyerUsername: string): Promise<void> {
    await this.sendToUser(sellerId, {
      title: '✅ Entrega confirmada',
      body: `@${buyerUsername} confirmó que recibió su pedido`,
      data: { type: 'order_delivered' },
    });
  }

  async notifyPaymentReceived(sellerId: string, orderId: string): Promise<void> {
    await this.sendToUser(sellerId, {
      title: '💳 Pago recibido',
      body: 'Un comprador completó su pago. Ya puedes preparar el envío.',
      data: { type: 'payment_received', orderId },
    });
  }

  async notifyDisputeOpened(sellerId: string, orderId: string): Promise<void> {
    await this.sendToUser(sellerId, {
      title: '⚠️ Disputa abierta',
      body: 'Un comprador abrió una disputa en una de tus órdenes.',
      data: { type: 'dispute_opened', orderId },
    });
  }

  async notifyDisputeResolved(buyerId: string, status: string, resolutionNote: string): Promise<void> {
    const isResolved = status === 'resolved';
    await this.sendToUser(buyerId, {
      title: isResolved ? '✅ Disputa resuelta' : '❌ Disputa rechazada',
      body: resolutionNote,
      data: { type: 'dispute_resolved', status },
    });
  }
}
