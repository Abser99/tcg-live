import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushToken } from './entities/push-token.entity';
import { Notification } from './entities/notification.entity';
import Expo, { ExpoPushMessage } from 'expo-server-sdk';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly expo = new Expo();

  constructor(
    @InjectRepository(PushToken)
    private readonly tokensRepo: Repository<PushToken>,
    @InjectRepository(Notification)
    private readonly notifsRepo: Repository<Notification>,
  ) {}

  /** Derive the in-app deep link a notification should open, from its data payload. */
  private linkFor(data?: Record<string, unknown>): string | null {
    const type = (data?.type as string) ?? '';
    const auctionId = data?.auctionId as string | undefined;
    switch (type) {
      case 'outbid':
      case 'auction_live':
      case 'seller_live':
      case 'seller_live_soon':
      case 'stream_due':
        return auctionId ? `/auctions/${auctionId}` : '/auctions';
      case 'giveaway_won':
      case 'auction_win':
      case 'order_confirmed':
      case 'order_shipped':
      case 'order_delivered':
      case 'payment_received':
      case 'new_order':
        return '/compras';
      case 'new_message':
        return '/mensajes';
      case 'dispute_opened':
      case 'dispute_resolved':
        return '/perfil';
      default:
        return null;
    }
  }

  // ── In-app notification feed (persisted; powers the navbar bell) ──────────
  async listForUser(userId: string, limit = 30): Promise<Notification[]> {
    return this.notifsRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(1, limit), 50),
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notifsRepo.count({ where: { userId, read: false } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.notifsRepo.update({ id, userId }, { read: true });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifsRepo.update({ userId, read: false }, { read: true });
  }

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
    // Persist for the in-app feed (bell) regardless of whether a push token exists.
    try {
      await this.notifsRepo.save(this.notifsRepo.create({
        userId,
        type: (notification.data?.type as string) ?? 'general',
        title: notification.title,
        body: notification.body,
        link: this.linkFor(notification.data),
      }));
    } catch (err) {
      this.logger.warn(`Failed to persist notification for ${userId}: ${err}`);
    }

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

  async notifyAuctionGoingLive(userId: string, auctionTitle: string, auctionId: string): Promise<void> {
    await this.sendToUser(userId, {
      title: '🔴 ¡Subasta en vivo!',
      body: `"${auctionTitle}" acaba de comenzar`,
      data: { type: 'auction_live', auctionId },
    });
  }

  async notifySellerGoingLive(userId: string, sellerUsername: string, auctionTitle: string, auctionId: string): Promise<void> {
    await this.sendToUser(userId, {
      title: `🔴 @${sellerUsername} está en vivo`,
      body: `"${auctionTitle}" acaba de comenzar`,
      data: { type: 'seller_live', auctionId },
    });
  }

  /** Reminder to a follower ~1h before a seller's scheduled stream. */
  async notifySellerLiveSoon(
    userId: string, sellerUsername: string, auctionTitle: string, auctionId: string, minutes: number,
  ): Promise<void> {
    await this.sendToUser(userId, {
      title: `⏰ @${sellerUsername} transmite pronto`,
      body: `"${auctionTitle}" comienza en ${minutes} min`,
      data: { type: 'seller_live_soon', auctionId },
    });
  }

  /** Nudge the seller when their scheduled stream is due to start. */
  async notifyStreamDue(sellerId: string, auctionTitle: string, auctionId: string): Promise<void> {
    await this.sendToUser(sellerId, {
      title: '📅 Es hora de tu stream',
      body: `"${auctionTitle}" estaba programado para ahora. Ábrelo para iniciarlo.`,
      data: { type: 'stream_due', auctionId },
    });
  }

  /** The winner of a live giveaway — the prize ships like any other order. */
  async notifyGiveawayWon(userId: string, sellerUsername: string, prize: string): Promise<void> {
    await this.sendToUser(userId, {
      title: '🎉 ¡Ganaste el sorteo!',
      body: `@${sellerUsername} te dio "${prize}". Confirma tu dirección para recibirlo.`,
      data: { type: 'giveaway_won' },
    });
  }

  async notifyNewMessage(recipientId: string, senderUsername: string, orderId: string): Promise<void> {
    await this.sendToUser(recipientId, {
      title: `💬 Nuevo mensaje de @${senderUsername}`,
      body: 'Toca para ver la conversación',
      data: { type: 'new_message', orderId },
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
