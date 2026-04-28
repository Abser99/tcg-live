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
import { useAuthStore } from '../../store/auth.store';
import StreamPublisher from '../../components/streaming/StreamPublisher';
import { Auction, AuctionItem } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { formatMXN } from '../../utils/currency';
import { ProfileStackParamList } from '../../navigation/types';
import { WS_URL } from '../../api/client';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ManageAuction'>;

const CONDITIONS: Record<string, string> = {
  mint: 'Mint', near_mint: 'Near Mint', excellent: 'Excellent', good: 'Good', played: 'Played',
};

export default function ManageAuctionScreen({ route, navigation }: Props) {
  const { auctionId } = route.params;
  const { token } = useAuthStore();

  const [auction, setAuction] = useState<Auction | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState<AuctionItem | null>(null);
  const [connected, setConnected] = useState(false);
  const [acting, setActing] = useState(false);
  const [streamToken, setStreamToken] = useState<{ token: string; wsUrl: string } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await auctionsApi.get(auctionId);
      setAuction(data);
      setActiveItem(data.items?.find((i) => i.status === 'active') ?? null);
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

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-auction', auctionId);
    });
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
    });

    return () => {
      socket.emit('leave-auction', auctionId);
      socket.disconnect();
    };
  }, [token, auctionId, load]);

  const handleGoLive = async () => {
    try {
      const { data } = await auctionsApi.getLiveKitToken(auctionId);
      setStreamToken(data);
      setIsStreaming(true);
    } catch {
      Alert.alert('Error', 'No se pudo iniciar el stream');
    }
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
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.message ?? 'No se pudo iniciar');
          } finally {
            setActing(false);
          }
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
          try {
            await auctionsApi.closeItem(activeItem.id);
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.message ?? 'No se pudo cerrar');
          } finally {
            setActing(false);
          }
        },
      },
    ]);
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
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.message ?? 'No se pudo terminar');
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  };

  if (loading || !auction) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isScheduled = auction.status === 'scheduled';
  const isLive = auction.status === 'live';
  const isEnded = auction.status === 'ended';
  const sortedItems = [...(auction.items ?? [])].sort((a, b) => a.position - b.position);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>{auction.title}</Text>
        <View style={[styles.wsIndicator, { backgroundColor: connected ? colors.success : colors.textMuted }]} />
      </View>

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

      {isScheduled && (
        <View style={styles.actionCard}>
          <Text style={styles.actionHint}>La subasta está lista. Iníciala cuando estés en vivo.</Text>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.success }, acting && styles.btnDisabled]}
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
                style={[styles.actionBtn, { backgroundColor: colors.warning }, acting && styles.btnDisabled]}
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

      {isEnded && (
        <View style={[styles.actionCard, { borderColor: colors.textMuted }]}>
          <Ionicons name="checkmark-done-outline" size={32} color={colors.textMuted} style={{ marginBottom: spacing.xs }} />
          <Text style={styles.actionHint}>Esta subasta ha terminado.</Text>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('AuctionOrders', { auctionId, title: auction.title })}
          >
            <Ionicons name="receipt-outline" size={18} color={colors.white} />
            <Text style={styles.actionBtnText}>Ver Pedidos</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>CARTAS ({sortedItems.length})</Text>
        {sortedItems.map((item) => (
          <View key={item.id} style={[styles.itemRow, item.status === 'active' && styles.itemActive]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.cardName}</Text>
              {item.cardSet && <Text style={styles.itemMeta}>{item.cardSet}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.itemPrice}>{formatMXN(item.currentPrice)}</Text>
              <Text style={[
                styles.itemStatus,
                { color: item.status === 'sold' ? colors.success : item.status === 'active' ? colors.warning : colors.textMuted },
              ]}>
                {item.status === 'active' ? '▶ activa' : item.status === 'sold' ? 'vendida' : item.status === 'pending' ? 'pendiente' : 'no vendida'}
              </Text>
            </View>
          </View>
        ))}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { color: colors.text, fontSize: font.xl, fontWeight: '800', flex: 1, marginRight: spacing.sm },
  wsIndicator: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  actionCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md, alignItems: 'center', gap: spacing.md,
  },
  actionHint: { color: colors.textMuted, fontSize: font.md, textAlign: 'center' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
    borderRadius: radius.md, width: '100%', justifyContent: 'center',
  },
  actionBtnText: { color: colors.white, fontWeight: '700', fontSize: font.base },
  btnDisabled: { opacity: 0.6 },
  activeCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.primary,
    marginBottom: spacing.md, gap: spacing.xs,
  },
  sectionLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.sm },
  cardName: { color: colors.text, fontSize: font.xl, fontWeight: '800' },
  cardMeta: { color: colors.textMuted, fontSize: font.md },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.sm },
  priceLabel: { color: colors.textMuted, fontSize: font.sm },
  price: { color: colors.primaryLight, fontSize: font.xxl, fontWeight: '800' },
  winnerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.sm,
    paddingVertical: 4, borderRadius: radius.sm,
  },
  winnerText: { color: colors.warning, fontSize: font.sm },
  streamSection: { marginBottom: spacing.md },
  goLiveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.error,
    paddingVertical: spacing.md, borderRadius: radius.md,
  },
  goLiveBtnText: { color: colors.white, fontWeight: '700', fontSize: font.base },
  ordersLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, marginBottom: spacing.xs },
  ordersLinkText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  endBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, padding: spacing.md, marginBottom: spacing.md,
  },
  endBtnText: { color: colors.error, fontWeight: '600', fontSize: font.base },
  section: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  itemActive: {
    backgroundColor: colors.surfaceAlt,
    marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  itemName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  itemMeta: { color: colors.textMuted, fontSize: font.sm },
  itemPrice: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  itemStatus: { fontSize: font.sm },
});
