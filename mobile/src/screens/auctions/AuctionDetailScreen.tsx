import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import { auctionsApi } from '../../api/auctions';
import { useAuthStore } from '../../store/auth.store';
import { Auction, AuctionItem, Bid } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { AppStackParamList } from '../../navigation/types';
import { WS_URL } from '../../api/client';
import { formatMXN } from '../../utils/currency';

type Props = NativeStackScreenProps<AppStackParamList, 'AuctionDetail'>;

const CONDITIONS: Record<string, string> = {
  mint: 'Mint', near_mint: 'Near Mint', excellent: 'Excellent', good: 'Good', played: 'Played',
};

export default function AuctionDetailScreen({ route, navigation }: Props) {
  const { auctionId } = route.params;
  const { token, user } = useAuthStore();

  const [auction, setAuction] = useState<Auction | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState<AuctionItem | null>(null);
  const [recentBids, setRecentBids] = useState<Bid[]>([]);
  const [bidAmount, setBidAmount] = useState('');
  const [bidding, setBidding] = useState(false);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await auctionsApi.get(auctionId);
      setAuction(data);
      const active = data.items?.find((i) => i.status === 'active') ?? null;
      setActiveItem(active);
      if (active) {
        const { data: bids } = await auctionsApi.getItemBids(active.id);
        setRecentBids(bids.slice(0, 10));
      }
    } catch {
      Alert.alert('Error', 'No se pudo cargar la subasta');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [auctionId]);

  // WebSocket connection
  useEffect(() => {
    if (!token) return;

    const socket = io(`${WS_URL}/auctions`, {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-auction', auctionId);
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('bid:placed', (data) => {
      setActiveItem((prev) => prev ? ({ ...prev!, currentPrice: data.amount as number, winnerId: data.bidderId as string }) : null);
      setRecentBids((prev) => [
        {
          id: data.bidId,
          auctionItemId: data.itemId,
          bidderId: data.bidderId,
          bidder: { username: data.bidderUsername as string } as Bid['bidder'],
          amount: data.amount,
          createdAt: data.timestamp,
        },
        ...prev.slice(0, 9),
      ]);
    });

    socket.on('item:closed', (data) => {
      setActiveItem((prev) => prev?.id === data.itemId ? ({ ...prev!, status: data.status as AuctionItem['status'] }) : prev);
      if (data.nextItemId) {
        load();
      }
    });

    socket.on('auction:started', () => {
      load();
    });

    socket.on('auction:ended', () => {
      setAuction((prev) => prev ? { ...prev, status: 'ended' } : prev);
    });

    return () => {
      socket.emit('leave-auction', auctionId);
      socket.disconnect();
    };
  }, [token, auctionId, load]);

  useEffect(() => { load(); }, [load]);

  const handleBid = async () => {
    const amountCents = Math.round(parseFloat(bidAmount) * 100);
    if (!activeItem || isNaN(amountCents) || amountCents <= 0) {
      Alert.alert('Error', 'Ingresa un monto válido');
      return;
    }
    if (amountCents <= activeItem.currentPrice) {
      Alert.alert('Error', `La oferta debe ser mayor a ${formatMXN(activeItem.currentPrice)}`);
      return;
    }
    setBidding(true);
    try {
      await auctionsApi.placeBid(activeItem.id, amountCents);
      setBidAmount('');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message ?? 'No se pudo realizar la oferta');
    } finally {
      setBidding(false);
    }
  };

  if (loading || !auction) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isLive = auction.status === 'live';
  const isSeller = auction.sellerId === user?.id;
  const minBid = activeItem ? (activeItem.currentPrice / 100) + 1 : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={[styles.badge, { backgroundColor: isLive ? colors.error : colors.textMuted }]}>
          {isLive && <View style={styles.liveDot} />}
          <Text style={styles.badgeText}>{isLive ? 'EN VIVO' : auction.status.toUpperCase()}</Text>
        </View>
        <View style={[styles.wsIndicator, { backgroundColor: connected ? colors.success : colors.textMuted }]} />
      </View>

      <Text style={styles.title}>{auction.title}</Text>
      <Text style={styles.seller}>@{auction.seller?.username}</Text>

      {auction.description ? (
        <Text style={styles.description}>{auction.description}</Text>
      ) : null}

      {activeItem && (
        <View style={styles.activeCard}>
          <Text style={styles.sectionLabel}>CARTA ACTUAL</Text>
          <Text style={styles.cardName}>{activeItem.cardName}</Text>
          {activeItem.cardSet && (
            <Text style={styles.cardMeta}>{activeItem.cardSet} {activeItem.cardNumber ? `· #${activeItem.cardNumber}` : ''}</Text>
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
                <Text style={styles.winnerText}>
                  {activeItem.winnerId === user?.id ? 'Tu oferta' : 'Alguien ofertó'}
                </Text>
              </View>
            )}
          </View>

          {isLive && !isSeller && (
            <View style={styles.bidRow}>
              <TextInput
                style={styles.bidInput}
                placeholder={`Mín. $${minBid.toFixed(2)}`}
                placeholderTextColor={colors.textMuted}
                value={bidAmount}
                onChangeText={setBidAmount}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                style={[styles.bidButton, bidding && styles.buttonDisabled]}
                onPress={handleBid}
                disabled={bidding}
              >
                {bidding ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.bidButtonText}>Ofertar</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {recentBids.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>OFERTAS RECIENTES</Text>
          {recentBids.map((bid) => (
            <View key={bid.id} style={styles.bidRow2}>
              <Text style={styles.bidUser}>@{bid.bidder?.username}</Text>
              <Text style={[styles.bidAmt, bid.bidderId === user?.id && styles.myBid]}>
                {formatMXN(bid.amount)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {auction.items && auction.items.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TODAS LAS CARTAS</Text>
          {auction.items
            .sort((a, b) => a.position - b.position)
            .map((item) => (
              <View key={item.id} style={[styles.itemRow, item.status === 'active' && styles.itemActive]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.cardName}</Text>
                  {item.cardSet && <Text style={styles.itemMeta}>{item.cardSet}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.itemPrice}>{formatMXN(item.currentPrice)}</Text>
                  <Text style={[styles.itemStatus, { color: item.status === 'sold' ? colors.success : colors.textMuted }]}>
                    {item.status === 'active' ? '▶ activa' : item.status === 'sold' ? 'vendida' : item.status === 'pending' ? 'pendiente' : 'no vendida'}
                  </Text>
                </View>
              </View>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  badgeText: { color: colors.white, fontSize: font.sm, fontWeight: '700' },
  wsIndicator: { width: 8, height: 8, borderRadius: 4 },
  title: { color: colors.text, fontSize: font.xl, fontWeight: '800', marginBottom: spacing.xs },
  seller: { color: colors.textMuted, fontSize: font.md, marginBottom: spacing.md },
  description: { color: colors.textMuted, fontSize: font.md, marginBottom: spacing.md },
  activeCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.primary, marginBottom: spacing.md },
  sectionLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.sm },
  cardName: { color: colors.text, fontSize: font.xl, fontWeight: '800', marginBottom: spacing.xs },
  cardMeta: { color: colors.textMuted, fontSize: font.md, marginBottom: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, marginBottom: spacing.md },
  priceLabel: { color: colors.textMuted, fontSize: font.sm },
  price: { color: colors.primaryLight, fontSize: font.xxl, fontWeight: '800' },
  winnerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  winnerText: { color: colors.warning, fontSize: font.sm },
  bidRow: { flexDirection: 'row', gap: spacing.sm },
  bidInput: { flex: 1, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text, fontSize: font.base },
  bidButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  buttonDisabled: { opacity: 0.6 },
  bidButtonText: { color: colors.white, fontWeight: '700', fontSize: font.md },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  bidRow2: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  bidUser: { color: colors.textMuted, fontSize: font.md },
  bidAmt: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  myBid: { color: colors.primaryLight },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemActive: { backgroundColor: colors.surfaceAlt, marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  itemName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  itemMeta: { color: colors.textMuted, fontSize: font.sm },
  itemPrice: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  itemStatus: { fontSize: font.sm },
});
