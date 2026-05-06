import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import { auctionsApi } from '../../api/auctions';
import { ordersApi } from '../../api/orders';
import { templatesApi } from '../../api/templates';
import { useAuthStore } from '../../store/auth.store';
import StreamPublisher from '../../components/streaming/StreamPublisher';
import { Auction, AuctionItem, Order } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { formatMXN } from '../../utils/currency';
import { ProfileStackParamList } from '../../navigation/types';
import { WS_URL } from '../../api/client';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ManageAuction'>;

const CONDITIONS: Record<string, string> = {
  mint: 'Mint', near_mint: 'Near Mint', excellent: 'Excellent', good: 'Good', played: 'Played',
};

const STATUS_COLOR: Record<AuctionItem['status'], string> = {
  active:  '#f59e0b',
  sold:    '#22c55e',
  unsold:  '#6b7280',
  pending: '#6b7280',
};

const STATUS_LABEL: Record<AuctionItem['status'], string> = {
  active:  '▶ En subasta',
  sold:    '✓ Vendida',
  unsold:  '✗ No vendida',
  pending: '· Pendiente',
};

interface ItemBuyerInfo {
  buyerLabel: string;
  paymentStatus: string;
  orderStatus: string;
  orderId: string;
}

export default function ManageAuctionScreen({ route, navigation }: Props) {
  const { auctionId } = route.params;
  const { token } = useAuthStore();

  const [auction, setAuction] = useState<Auction | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState<AuctionItem | null>(null);
  const [connected, setConnected] = useState(false);
  const [acting, setActing] = useState(false);
  const [streamToken, setStreamToken] = useState<{ token: string; wsUrl: string } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  const load = useCallback(async () => {
    try {
      const [auctionRes, ordersRes] = await Promise.all([
        auctionsApi.get(auctionId),
        ordersApi.auctionOrders(auctionId).catch(() => ({ data: [] as Order[] })),
      ]);
      setAuction(auctionRes.data);
      setOrders(ordersRes.data);
      setActiveItem(auctionRes.data.items?.find((i) => i.status === 'active') ?? null);
    } catch {
      Alert.alert('Error', 'No se pudo cargar la subasta');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [auctionId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    const socket = io(`${WS_URL}/auctions`, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;
    socket.on('connect', () => { setConnected(true); socket.emit('join-auction', auctionId); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('bid:placed', (data) => {
      setActiveItem((prev) =>
        prev ? { ...prev, currentPrice: data.amount as number, winnerId: data.bidderId as string } : null,
      );
    });
    socket.on('item:closed', () => load());
    socket.on('auction:started', () => load());
    socket.on('auction:ended', () => {
      setAuction((prev) => (prev ? { ...prev, status: 'ended' } : prev));
      load();
    });
    return () => { socket.emit('leave-auction', auctionId); socket.disconnect(); };
  }, [token, auctionId, load]);

  const handleGoLive = async () => {
    try {
      const { data } = await auctionsApi.getLiveKitToken(auctionId);
      setStreamToken(data);
      setIsStreaming(true);
    } catch { Alert.alert('Error', 'No se pudo iniciar el stream'); }
  };

  const handleStart = () => {
    Alert.alert('Iniciar subasta', '¿Listo para comenzar? Esto es en vivo y no se puede pausar.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Iniciar', onPress: async () => {
          setActing(true);
          try {
            const { data } = await auctionsApi.start(auctionId);
            setAuction(data);
            await load();
          } catch (err: any) { Alert.alert('Error', err.response?.data?.message ?? 'No se pudo iniciar'); }
          finally { setActing(false); }
        },
      },
    ]);
  };

  const handleCloseItem = () => {
    if (!activeItem) return;
    const msg = activeItem.winnerId
      ? `¿Cerrar "${activeItem.cardName}"? Se marcará como vendida.`
      : `"${activeItem.cardName}" no tiene ofertas. ¿Cerrar sin vender?`;
    Alert.alert('Cerrar carta', msg, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar', onPress: async () => {
          setActing(true);
          try { await auctionsApi.closeItem(activeItem.id); }
          catch (err: any) { Alert.alert('Error', err.response?.data?.message ?? 'No se pudo cerrar'); }
          finally { setActing(false); }
        },
      },
    ]);
  };

  const handleSaveTemplate = async () => {
    if (!auction) return;
    try {
      await templatesApi.fromAuction(auctionId);
      Alert.alert('Template guardado', `"${auction.title}" guardado como template.`);
    } catch { Alert.alert('Error', 'No se pudo guardar el template'); }
  };

  const handleRelist = () => {
    const unsoldCount = auction?.items?.filter(i => i.status === 'unsold').length ?? 0;
    Alert.alert(
      'Volver a subastar',
      `Se creará una nueva subasta con ${unsoldCount} ${unsoldCount === 1 ? 'carta no vendida' : 'cartas no vendidas'}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Crear subasta', onPress: async () => {
            setActing(true);
            try {
              const { data } = await auctionsApi.relist(auctionId);
              navigation.replace('ManageAuction', { auctionId: data.id });
            } catch (err: any) { Alert.alert('Error', err.response?.data?.message ?? 'No se pudo crear'); }
            finally { setActing(false); }
          },
        },
      ],
    );
  };

  const handleEnd = () => {
    Alert.alert('Terminar subasta', '¿Seguro que quieres terminar la subasta ahora?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Terminar', style: 'destructive', onPress: async () => {
          setActing(true);
          try {
            const { data } = await auctionsApi.end(auctionId);
            setAuction(data);
          } catch (err: any) { Alert.alert('Error', err.response?.data?.message ?? 'No se pudo terminar'); }
          finally { setActing(false); }
        },
      },
    ]);
  };

  if (loading || !auction) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const isScheduled = auction.status === 'scheduled';
  const isLive = auction.status === 'live';
  const isEnded = auction.status === 'ended';
  const sortedItems = [...(auction.items ?? [])].sort((a, b) => a.position - b.position);
  const unsoldItems = sortedItems.filter(i => i.status === 'unsold');

  // Build auctionItemId → buyer info map
  const buyerMap: Record<string, ItemBuyerInfo> = {};
  orders.forEach((order, idx) => {
    order.items.forEach(oi => {
      buyerMap[oi.auctionItemId] = {
        buyerLabel: `Comprador #${idx + 1}`,
        paymentStatus: order.paymentStatus,
        orderStatus: order.status,
        orderId: order.id,
      };
    });
  });

  const soldCount = sortedItems.filter(i => i.status === 'sold').length;
  const totalRevenue = sortedItems
    .filter(i => i.status === 'sold')
    .reduce((s, i) => s + i.currentPrice, 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>{auction.title}</Text>
        <View style={[styles.wsIndicator, { backgroundColor: connected ? colors.success : colors.textMuted }]} />
      </View>

      {/* Stream section */}
      {isLive && (
        <View style={styles.streamSection}>
          {isStreaming && streamToken ? (
            <StreamPublisher
              wsUrl={streamToken.wsUrl}
              token={streamToken.token}
              onStop={() => { setIsStreaming(false); setStreamToken(null); }}
            />
          ) : (
            <TouchableOpacity style={styles.goLiveBtn} onPress={handleGoLive}>
              <Ionicons name="videocam-outline" size={20} color={colors.white} />
              <Text style={styles.goLiveBtnText}>Ir en vivo</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Start action */}
      {isScheduled && (
        <View style={styles.actionCard}>
          <Text style={styles.actionHint}>La subasta está lista. Iníciala cuando estés en vivo.</Text>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.success, shadowColor: colors.success }, acting && styles.btnDisabled]}
            onPress={handleStart}
            disabled={acting}
          >
            {acting ? <ActivityIndicator color={colors.white} /> : (
              <>
                <Ionicons name="play" size={18} color={colors.white} />
                <Text style={styles.actionBtnText}>Iniciar Subasta</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Live controls */}
      {isLive && (
        <>
          {activeItem ? (
            <View style={styles.activeCard}>
              <Text style={styles.sectionLabel}>CARTA ACTUAL</Text>
              <Text style={styles.cardName}>{activeItem.cardName}</Text>
              {activeItem.cardSet && (
                <Text style={styles.cardMeta}>
                  {activeItem.cardSet}{activeItem.cardNumber ? ` · #${activeItem.cardNumber}` : ''}
                </Text>
              )}
              <Text style={styles.cardMeta}>{CONDITIONS[activeItem.condition]}</Text>
              <View style={styles.priceRow}>
                <View>
                  <Text style={styles.priceLabel}>Precio actual</Text>
                  <Text style={styles.price}>{formatMXN(activeItem.currentPrice)}</Text>
                </View>
                {activeItem.winnerId && (
                  <View style={styles.winnerBadge}>
                    <Ionicons name="trophy-outline" size={14} color={colors.warning} />
                    <Text style={styles.winnerText}>Hay oferta</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.warning, shadowColor: colors.warning }, acting && styles.btnDisabled]}
                onPress={handleCloseItem}
                disabled={acting}
              >
                {acting ? <ActivityIndicator color={colors.white} /> : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color={colors.white} />
                    <Text style={styles.actionBtnText}>Cerrar esta carta</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.actionCard}>
              <Text style={styles.actionHint}>No hay carta activa. Cierra la subasta cuando termines.</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.ordersLink}
            onPress={() => navigation.navigate('AuctionOrders', { auctionId, title: auction.title })}
          >
            <Ionicons name="receipt-outline" size={16} color={colors.textMuted} />
            <Text style={styles.ordersLinkText}>Ver pedidos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.endBtn, acting && styles.btnDisabled]}
            onPress={handleEnd}
            disabled={acting}
          >
            <Ionicons name="stop-circle-outline" size={18} color={colors.error} />
            <Text style={styles.endBtnText}>Terminar subasta</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Ended actions */}
      {isEnded && (
        <View style={[styles.actionCard, { borderColor: colors.textMuted }]}>
          <Ionicons name="checkmark-done-outline" size={32} color={colors.textMuted} style={{ marginBottom: spacing.xs }} />
          <Text style={styles.actionHint}>Esta subasta ha terminado.</Text>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
            onPress={() => navigation.navigate('AuctionOrders', { auctionId, title: auction.title })}
          >
            <Ionicons name="receipt-outline" size={18} color={colors.white} />
            <Text style={styles.actionBtnText}>Ver Pedidos</Text>
          </TouchableOpacity>
          {unsoldItems.length > 0 && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.accent, shadowColor: colors.accent }, acting && styles.btnDisabled]}
              onPress={handleRelist}
              disabled={acting}
            >
              {acting ? <ActivityIndicator color={colors.white} /> : (
                <>
                  <Ionicons name="refresh-outline" size={18} color={colors.white} />
                  <Text style={styles.actionBtnText}>
                    Relist · {unsoldItems.length} {unsoldItems.length === 1 ? 'carta' : 'cartas'} no vendidas
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }]}
            onPress={handleSaveTemplate}
          >
            <Ionicons name="bookmark-outline" size={18} color={colors.textMuted} />
            <Text style={[styles.actionBtnText, { color: colors.textMuted }]}>Guardar como template</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Items list — full info for seller */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>CARTAS ({sortedItems.length})</Text>
          {soldCount > 0 && (
            <Text style={styles.revenueLabel}>{soldCount} vendidas · {formatMXN(totalRevenue)}</Text>
          )}
        </View>

        {sortedItems.map((item) => {
          const buyer = buyerMap[item.id];
          const isSold = item.status === 'sold';
          const isActive = item.status === 'active';
          return (
            <View key={item.id} style={[styles.itemCard, isActive && styles.itemCardActive]}>
              {/* Row 1: number + name + status */}
              <View style={styles.itemTopRow}>
                <View style={[styles.positionBadge, isActive && styles.positionBadgeActive]}>
                  <Text style={[styles.positionText, isActive && { color: colors.white }]}>#{item.position}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.cardName}</Text>
                  {(item.cardSet || item.cardNumber) && (
                    <Text style={styles.itemMeta}>
                      {[item.cardSet, item.cardNumber ? `#${item.cardNumber}` : null].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                </View>
                <Text style={[styles.itemStatusBadge, { color: STATUS_COLOR[item.status] }]}>
                  {STATUS_LABEL[item.status]}
                </Text>
              </View>

              {/* Row 2: condition + price */}
              <View style={styles.itemDetailRow}>
                <View style={styles.conditionTag}>
                  <Text style={styles.conditionText}>{CONDITIONS[item.condition]}</Text>
                </View>
                <View style={styles.priceGroup}>
                  <Text style={styles.startingPriceLabel}>Inicio</Text>
                  <Text style={styles.startingPrice}>{formatMXN(item.startingPrice)}</Text>
                  {isSold && item.currentPrice !== item.startingPrice && (
                    <>
                      <Ionicons name="arrow-forward" size={12} color={colors.textMuted} style={{ marginHorizontal: 2 }} />
                      <Text style={styles.finalPrice}>{formatMXN(item.currentPrice)}</Text>
                    </>
                  )}
                  {!isSold && isActive && (
                    <>
                      <Ionicons name="arrow-forward" size={12} color={colors.textMuted} style={{ marginHorizontal: 2 }} />
                      <Text style={[styles.finalPrice, { color: colors.warning }]}>{formatMXN(item.currentPrice)}</Text>
                    </>
                  )}
                </View>
              </View>

              {/* Row 3: buyer info (if sold) */}
              {isSold && buyer && (
                <View style={styles.buyerRow}>
                  <Ionicons name="person-circle-outline" size={14} color={colors.success} />
                  <Text style={styles.buyerLabel}>{buyer.buyerLabel}</Text>
                  <View style={[styles.payChip, buyer.paymentStatus === 'paid' ? styles.payChipPaid : styles.payChipUnpaid]}>
                    <Text style={buyer.paymentStatus === 'paid' ? styles.payChipTextPaid : styles.payChipTextUnpaid}>
                      {buyer.paymentStatus === 'paid' ? '💳 Pagado' : '⏳ Sin pagar'}
                    </Text>
                  </View>
                  <Text style={[styles.orderStatusText, { color: colors.textMuted }]}>
                    {buyer.orderStatus === 'pending' ? 'Pendiente'
                      : buyer.orderStatus === 'confirmed' ? 'Confirmado'
                      : buyer.orderStatus === 'shipped' ? 'Enviado'
                      : 'Entregado'}
                  </Text>
                </View>
              )}

              {isSold && !buyer && (
                <View style={styles.buyerRow}>
                  <Ionicons name="person-circle-outline" size={14} color={colors.textMuted} />
                  <Text style={[styles.buyerLabel, { color: colors.textMuted }]}>Comprador no disponible</Text>
                </View>
              )}

              {item.reservePrice && !isSold && (
                <Text style={styles.reserveNote}>Reserva: {formatMXN(item.reservePrice)}</Text>
              )}
            </View>
          );
        })}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  titleRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: font.xl, fontWeight: '900', flex: 1, marginRight: spacing.sm, letterSpacing: -0.3 },
  wsIndicator: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },

  actionCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md, alignItems: 'center', gap: spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  actionHint: { color: colors.textMuted, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderRadius: radius.md, width: '100%', justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35,
    shadowRadius: 6, elevation: 4,
  },
  actionBtnText: { color: colors.white, fontWeight: '900', fontSize: font.base, letterSpacing: 0.3 },
  btnDisabled: { opacity: 0.55 },

  // Active card with glow border
  activeCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: spacing.md, borderWidth: 1.5, borderColor: colors.primary,
    marginBottom: spacing.md, gap: spacing.sm,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  sectionLabel: {
    color: colors.textMuted, fontSize: font.xs, fontWeight: '800',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  revenueLabel: {
    color: colors.success, fontSize: font.sm, fontWeight: '800',
    backgroundColor: colors.success + '18', paddingHorizontal: spacing.sm,
    paddingVertical: 3, borderRadius: radius.full, borderWidth: 1, borderColor: colors.success + '44',
  },
  cardName: { color: colors.text, fontSize: font.xl, fontWeight: '900', letterSpacing: -0.3 },
  cardMeta: { color: colors.textMuted, fontSize: font.md },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  priceLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  price: { color: colors.gold, fontSize: font.xxl, fontWeight: '900', letterSpacing: -0.5 },
  winnerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.warning + '22', paddingHorizontal: spacing.sm, paddingVertical: 5,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning + '55',
  },
  winnerText: { color: colors.warning, fontSize: font.sm, fontWeight: '700' },

  streamSection: { marginBottom: spacing.md },
  goLiveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.error,
    paddingVertical: spacing.md + 2, borderRadius: radius.md,
    shadowColor: colors.error, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 6,
  },
  goLiveBtnText: { color: colors.white, fontWeight: '900', fontSize: font.base, letterSpacing: 0.5 },

  ordersLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.sm, marginBottom: spacing.xs,
  },
  ordersLinkText: { color: colors.accent, fontSize: font.sm, fontWeight: '700' },
  endBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, padding: spacing.md, marginBottom: spacing.md,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.error + '44',
    backgroundColor: colors.error + '0A',
  },
  endBtnText: { color: colors.error, fontWeight: '700', fontSize: font.base },

  section: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },

  // Item cards — improved scannability
  itemCard: {
    borderBottomWidth: 1, borderBottomColor: colors.border + '88',
    paddingVertical: spacing.md, gap: 6,
  },
  itemCardActive: {
    backgroundColor: colors.primary + '12',
    marginHorizontal: -spacing.md, paddingHorizontal: spacing.md,
    borderRadius: radius.md, borderBottomWidth: 0, marginBottom: spacing.xs,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  itemTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  positionBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center', marginTop: 1,
  },
  positionBadgeActive: { backgroundColor: colors.primary, borderColor: colors.primaryLight },
  positionText: { color: colors.textMuted, fontSize: 11, fontWeight: '900' },
  itemName: { color: colors.text, fontSize: font.md, fontWeight: '700', lineHeight: 20 },
  itemMeta: { color: colors.textMuted, fontSize: font.sm, marginTop: 1 },
  itemStatusBadge: { fontSize: font.xs, fontWeight: '800', marginTop: 3, letterSpacing: 0.3 },
  itemDetailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginLeft: 38 },
  conditionTag: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.sm,
    paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.border,
  },
  conditionText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  priceGroup: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  startingPriceLabel: { color: colors.textMuted, fontSize: 11, marginRight: 2 },
  startingPrice: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  finalPrice: { color: colors.success, fontSize: font.sm, fontWeight: '900' },
  buyerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginLeft: 38, flexWrap: 'wrap' },
  buyerLabel: { color: colors.success, fontSize: font.sm, fontWeight: '700' },
  payChip: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  payChipPaid: { backgroundColor: colors.success + '28', borderWidth: 1, borderColor: colors.success + '55' },
  payChipUnpaid: { backgroundColor: colors.warning + '20', borderWidth: 1, borderColor: colors.warning + '44' },
  payChipTextPaid: { fontSize: 11, fontWeight: '800', color: colors.success },
  payChipTextUnpaid: { fontSize: 11, fontWeight: '800', color: colors.warning },
  payChipText: { fontSize: 11, fontWeight: '800', color: colors.text },
  orderStatusText: { fontSize: font.sm, color: colors.textMuted },
  reserveNote: { color: colors.textMuted, fontSize: font.sm, marginLeft: 38, fontStyle: 'italic' },
});
