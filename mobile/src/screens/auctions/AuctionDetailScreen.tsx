import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Image, Animated, FlatList,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import { auctionsApi } from '../../api/auctions';
import { paymentMethodsApi } from '../../api/paymentMethods';
import { useAuthStore } from '../../store/auth.store';
import { Auction, AuctionItem, Bid, ChatMessage, Reaction } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { AppStackParamList } from '../../navigation/types';
import { WS_URL } from '../../api/client';
import { formatMXN } from '../../utils/currency';
import StreamViewer from '../../components/streaming/StreamViewer';
import SliderButton from '../../components/SliderButton';

type Props = NativeStackScreenProps<AppStackParamList, 'AuctionDetail'>;

const CONDITIONS: Record<string, string> = {
  mint: 'Mint', near_mint: 'Near Mint', excellent: 'Excellent', good: 'Good', played: 'Played',
};

const REACTION_EMOJIS = ['🔥', '❤️', '💎', '🎯', '😮'];

interface FloatingReaction extends Reaction {
  localId: string;
  translateY: Animated.Value;
  opacity: Animated.Value;
}

function FloatingEmoji({ item }: { item: FloatingReaction }) {
  return (
    <Animated.Text style={[styles.floatingEmoji, { transform: [{ translateY: item.translateY }], opacity: item.opacity }]}>
      {item.emoji}
    </Animated.Text>
  );
}

export default function AuctionDetailScreen({ route, navigation }: Props) {
  const { auctionId } = route.params;
  const { token, user } = useAuthStore();

  const [auction, setAuction] = useState<Auction | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState<AuctionItem | null>(null);
  const [recentBids, setRecentBids] = useState<Bid[]>([]);
  const [bidAmount, setBidAmount] = useState('');
  const [bidding, setBidding] = useState(false);
  const [maxBidAmount, setMaxBidAmount] = useState('');
  const [showMaxBid, setShowMaxBid] = useState(false);
  const [settingMaxBid, setSettingMaxBid] = useState(false);
  const [connected, setConnected] = useState(false);
  const [streamCreds, setStreamCreds] = useState<{ token: string; wsUrl: string } | null>(null);
  const [hasPayment, setHasPayment] = useState(true); // optimistic: assume true until checked

  // Countdown timer
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [showChat, setShowChat] = useState(false);
  const chatListRef = useRef<FlatList>(null);

  // Reactions
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  const socketRef = useRef<Socket | null>(null);

  const load = useCallback(async () => {
    try {
      const [auctionRes, tokenRes] = await Promise.all([
        auctionsApi.get(auctionId),
        auctionsApi.getLiveKitToken(auctionId).catch(() => null),
      ]);
      setAuction(auctionRes.data);
      if (tokenRes) setStreamCreds(tokenRes.data);
      const active = auctionRes.data.items?.find((i) => i.status === 'active') ?? null;
      setActiveItem(active);
      if (active) {
        const { data: bids } = await auctionsApi.getItemBids(active.id);
        setRecentBids(bids.slice(0, 10));
      }
      // Check payment method if auction is live and user is a buyer
      if (auctionRes.data.status === 'live' && auctionRes.data.sellerId !== user?.id) {
        const { data } = await paymentMethodsApi.hasAny();
        setHasPayment(data.hasPaymentMethod);
      }
    } catch {
      Alert.alert('Error', 'No se pudo cargar la subasta');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [auctionId, user?.id]);

  const startCountdown = useCallback((closesAt: string | null) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!closesAt) { setSecondsLeft(null); return; }
    const tick = () => {
      const secs = Math.max(0, Math.round((new Date(closesAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(secs);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
  }, []);

  // Start/reset countdown when active item changes
  useEffect(() => {
    startCountdown(activeItem?.closesAt ?? null);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeItem?.id, activeItem?.closesAt, startCountdown]);

  const spawnFloatingReaction = useCallback((reaction: Reaction) => {
    const localId = `${Date.now()}-${Math.random()}`;
    const translateY = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    const item: FloatingReaction = { ...reaction, localId, translateY, opacity };

    setFloatingReactions((prev) => [...prev.slice(-6), item]);

    Animated.parallel([
      Animated.timing(translateY, { toValue: -90, duration: 1800, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    ]).start(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.localId !== localId));
    });
  }, []);

  // WebSocket
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
      setActiveItem((prev) => prev ? ({
        ...prev,
        currentPrice: data.amount as number,
        winnerId: data.bidderId as string,
        closesAt: (data.closesAt as string | null) ?? prev.closesAt,
      }) : null);
      if (data.closesAt) startCountdown(data.closesAt as string);
      setRecentBids((prev) => [
        {
          id: data.bidId, auctionItemId: data.itemId, bidderId: data.bidderId,
          bidder: { username: data.bidderUsername as string } as Bid['bidder'],
          amount: data.amount, createdAt: data.timestamp,
        },
        ...prev.slice(0, 9),
      ]);
    });

    socket.on('item:closed', (data) => {
      setActiveItem((prev) => prev?.id === data.itemId ? ({ ...prev, status: data.status as AuctionItem['status'] } as AuctionItem) : prev);
      if (data.nextItemId) {
        load();
        if (data.nextClosesAt) startCountdown(data.nextClosesAt as string);
      } else {
        startCountdown(null);
      }
    });

    socket.on('auction:started', () => load());
    socket.on('auction:ended', () => setAuction((prev) => prev ? { ...prev, status: 'ended' } : prev));

    socket.on('chat:message', (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev.slice(-99), msg]);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 50);
    });

    socket.on('reaction', (r: Reaction) => spawnFloatingReaction(r));

    return () => {
      socket.emit('leave-auction', auctionId);
      socket.disconnect();
    };
  }, [token, auctionId, load, spawnFloatingReaction, startCountdown]);

  useEffect(() => { load(); }, [load]);

  const handleBid = async () => {
    const amountCents = Math.round(parseFloat(bidAmount) * 100);
    if (!activeItem || isNaN(amountCents) || amountCents <= 0) { Alert.alert('Error', 'Ingresa un monto válido'); return; }
    if (amountCents <= activeItem.currentPrice) { Alert.alert('Error', `La oferta debe ser mayor a ${formatMXN(activeItem.currentPrice)}`); return; }
    setBidding(true);
    try { await auctionsApi.placeBid(activeItem.id, amountCents); setBidAmount(''); }
    catch (err: any) { Alert.alert('Error', err.response?.data?.message ?? 'No se pudo realizar la oferta'); }
    finally { setBidding(false); }
  };

  const handleSetMaxBid = async () => {
    const maxCents = Math.round(parseFloat(maxBidAmount) * 100);
    if (!activeItem || isNaN(maxCents) || maxCents <= 0) { Alert.alert('Error', 'Ingresa una oferta máxima válida'); return; }
    if (maxCents <= activeItem.currentPrice) { Alert.alert('Error', `La oferta máxima debe ser mayor a ${formatMXN(activeItem.currentPrice)}`); return; }
    setSettingMaxBid(true);
    try {
      await auctionsApi.setMaxBid(activeItem.id, maxCents);
      setMaxBidAmount(''); setShowMaxBid(false);
      Alert.alert('Activado', 'El sistema ofertará automáticamente por ti hasta ese monto.');
    } catch (err: any) { Alert.alert('Error', err.response?.data?.message ?? 'No se pudo activar la oferta máxima'); }
    finally { setSettingMaxBid(false); }
  };

  const sendChat = () => {
    const text = chatText.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit('chat:send', text);
    setChatText('');
  };

  const sendReaction = (emoji: string) => {
    socketRef.current?.emit('reaction:send', emoji);
  };

  if (loading || !auction) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const isLive = auction.status === 'live';
  const isSeller = auction.sellerId === user?.id;
  const minBid = activeItem ? (activeItem.currentPrice / 100) + 1 : 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={[styles.badge, { backgroundColor: isLive ? colors.error : colors.textMuted }]}>
            {isLive && <View style={styles.liveDot} />}
            <Text style={styles.badgeText}>{isLive ? 'EN VIVO' : auction.status.toUpperCase()}</Text>
          </View>
          <View style={[styles.wsIndicator, { backgroundColor: connected ? colors.success : colors.textMuted }]} />
        </View>

        {/* No payment method warning */}
        {isLive && !isSeller && !hasPayment && (
          <TouchableOpacity
            style={styles.paymentWarning}
            onPress={() => navigation.navigate('Profile' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="warning-outline" size={18} color="#92400e" />
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentWarningTitle}>Sin forma de pago</Text>
              <Text style={styles.paymentWarningText}>Agrega una tarjeta u OXXO para poder ofertar · Toca aquí</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Stream + floating reactions */}
        {isLive && streamCreds && (
          <View style={styles.streamWrap}>
            <StreamViewer wsUrl={streamCreds.wsUrl} token={streamCreds.token} />
            <View style={styles.reactionsOverlay} pointerEvents="none">
              {floatingReactions.map((r) => <FloatingEmoji key={r.localId} item={r} />)}
            </View>
          </View>
        )}

        {/* Reaction bar */}
        {isLive && (
          <View style={styles.reactionBar}>
            {REACTION_EMOJIS.map((emoji) => (
              <TouchableOpacity key={emoji} style={styles.reactionBtn} onPress={() => sendReaction(emoji)}>
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.chatToggle, showChat && styles.chatToggleActive]}
              onPress={() => setShowChat(p => !p)}
            >
              <Ionicons name="chatbubble-outline" size={16} color={showChat ? colors.white : colors.textMuted} />
              {chatMessages.length > 0 && <Text style={[styles.chatCount, showChat && { color: colors.white }]}>{chatMessages.length > 99 ? '99+' : chatMessages.length}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Chat panel */}
        {isLive && showChat && (
          <View style={styles.chatPanel}>
            <FlatList
              ref={chatListRef}
              data={chatMessages}
              keyExtractor={(_, i) => String(i)}
              style={styles.chatList}
              contentContainerStyle={{ padding: spacing.xs }}
              renderItem={({ item: msg }) => (
                <View style={styles.chatMsgRow}>
                  <Text style={[styles.chatUser, msg.userId === user?.id && styles.chatUserMe]}>@{msg.username}</Text>
                  <Text style={styles.chatMsgText}>{msg.message}</Text>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.chatEmpty}>Sé el primero en escribir algo 👋</Text>}
            />
            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                placeholder="Escribe un mensaje..."
                placeholderTextColor={colors.textMuted}
                value={chatText}
                onChangeText={setChatText}
                onSubmitEditing={sendChat}
                returnKeyType="send"
                maxLength={200}
              />
              <TouchableOpacity style={styles.chatSend} onPress={sendChat} disabled={!chatText.trim()}>
                <Ionicons name="send" size={18} color={chatText.trim() ? colors.primaryLight : colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={styles.title}>{auction.title}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('SellerProfile', { sellerId: auction.sellerId })}>
          <Text style={styles.seller}>@{auction.seller?.username} →</Text>
        </TouchableOpacity>
        {auction.description ? <Text style={styles.description}>{auction.description}</Text> : null}

        {/* Active item card */}
        {activeItem && (
          <View style={styles.activeCard}>
            {activeItem.imageUrls && activeItem.imageUrls.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll} contentContainerStyle={styles.imageScrollContent}>
                {activeItem.imageUrls.map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={styles.cardImage} resizeMode="contain" />
                ))}
              </ScrollView>
            )}
            <View style={styles.activeCardBody}>
              <View style={styles.itemLabelRow}>
                <Text style={styles.sectionLabel}>SUBASTA ACTUAL</Text>
                {secondsLeft !== null && (
                  <View style={[styles.timerBadge, secondsLeft <= 10 && styles.timerBadgeUrgent]}>
                    <Ionicons name="timer-outline" size={12} color={secondsLeft <= 10 ? colors.white : colors.textMuted} />
                    <Text style={[styles.timerText, secondsLeft <= 10 && styles.timerTextUrgent]}>
                      {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardName}>{activeItem.cardName}</Text>
              {activeItem.cardSet && (
                <Text style={styles.cardMeta}>{activeItem.cardSet}{activeItem.cardNumber ? ` · #${activeItem.cardNumber}` : ''}</Text>
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
                    <Text style={styles.winnerText}>{activeItem.winnerId === user?.id ? 'Tu oferta' : 'Alguien ofertó'}</Text>
                  </View>
                )}
              </View>

              {isLive && !isSeller && (
                <View style={styles.bidArea}>
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
                      style={[styles.maxBidToggle, showMaxBid && styles.maxBidToggleActive]}
                      onPress={() => setShowMaxBid(p => !p)}
                    >
                      <Ionicons name="trending-up-outline" size={15} color={showMaxBid ? colors.white : colors.textMuted} />
                      <Text style={[styles.maxBidToggleText, showMaxBid && { color: colors.white }]}>Máx</Text>
                    </TouchableOpacity>
                  </View>

                  {showMaxBid && (
                    <View style={styles.bidRow}>
                      <TextInput
                        style={[styles.bidInput, { borderColor: colors.accent }]}
                        placeholder="Oferta máxima (MXN)"
                        placeholderTextColor={colors.textMuted}
                        value={maxBidAmount}
                        onChangeText={setMaxBidAmount}
                        keyboardType="decimal-pad"
                      />
                      <TouchableOpacity
                        style={[styles.bidButton, { backgroundColor: colors.accent }, settingMaxBid && styles.buttonDisabled]}
                        onPress={handleSetMaxBid}
                        disabled={settingMaxBid}
                      >
                        {settingMaxBid ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.bidButtonText}>Activar</Text>}
                      </TouchableOpacity>
                    </View>
                  )}

                  <SliderButton label="Desliza para ofertar" onSlide={handleBid} disabled={!bidAmount.trim()} loading={bidding} />
                </View>
              )}
            </View>
          </View>
        )}

        {/* Recent bids */}
        {recentBids.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>OFERTAS RECIENTES</Text>
            {recentBids.map((bid) => (
              <View key={bid.id} style={styles.bidRow2}>
                <Text style={styles.bidUser}>@{bid.bidder?.username}</Text>
                <Text style={[styles.bidAmt, bid.bidderId === user?.id && styles.myBid]}>{formatMXN(bid.amount)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* All items queue */}
        {auction.items && auction.items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>COLA DE CARTAS</Text>
            {auction.items.sort((a, b) => a.position - b.position).map((item) => (
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
    </KeyboardAvoidingView>
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
  streamWrap: { position: 'relative', marginBottom: spacing.xs },
  reactionsOverlay: { position: 'absolute', bottom: 8, right: 12, width: 50, height: 120, justifyContent: 'flex-end', alignItems: 'center' },
  floatingEmoji: { position: 'absolute', fontSize: 28 },
  reactionBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, gap: 2 },
  reactionBtn: { padding: 6 },
  reactionEmoji: { fontSize: 22 },
  chatToggle: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  chatToggleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chatCount: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  chatPanel: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md, overflow: 'hidden' },
  chatList: { height: 180 },
  chatMsgRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingVertical: 2 },
  chatUser: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700' },
  chatUserMe: { color: colors.primaryLight },
  chatMsgText: { color: colors.text, fontSize: font.sm, flexShrink: 1 },
  chatEmpty: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center', padding: spacing.md },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  chatInput: { flex: 1, color: colors.text, fontSize: font.base, paddingVertical: 6 },
  chatSend: { paddingHorizontal: spacing.sm, paddingVertical: 6 },
  title: { color: colors.text, fontSize: font.xl, fontWeight: '800', marginBottom: spacing.xs, marginTop: spacing.sm },
  seller: { color: colors.textMuted, fontSize: font.md, marginBottom: spacing.md },
  description: { color: colors.textMuted, fontSize: font.md, marginBottom: spacing.md },
  activeCard: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.primary, marginBottom: spacing.md },
  imageScroll: { marginBottom: spacing.sm },
  imageScrollContent: { padding: spacing.sm, gap: spacing.sm },
  cardImage: { width: 140, height: 196, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  activeCardBody: { padding: spacing.md },
  itemLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700', letterSpacing: 1 },
  timerBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  timerBadgeUrgent: { backgroundColor: colors.error, borderColor: colors.error },
  timerText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700', fontVariant: ['tabular-nums'] as any },
  timerTextUrgent: { color: colors.white },
  cardName: { color: colors.text, fontSize: font.xl, fontWeight: '800', marginBottom: spacing.xs },
  cardMeta: { color: colors.textMuted, fontSize: font.md, marginBottom: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, marginBottom: spacing.md },
  priceLabel: { color: colors.textMuted, fontSize: font.sm },
  price: { color: colors.primaryLight, fontSize: font.xxl, fontWeight: '800' },
  winnerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  winnerText: { color: colors.warning, fontSize: font.sm },
  bidArea: { gap: spacing.sm },
  bidRow: { flexDirection: 'row', gap: spacing.sm },
  bidInput: { flex: 1, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text, fontSize: font.base },
  bidButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  buttonDisabled: { opacity: 0.6 },
  bidButtonText: { color: colors.white, fontWeight: '700', fontSize: font.md },
  maxBidToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  maxBidToggleActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  maxBidToggleText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700' },
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
  paymentWarning: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: '#fef3c7', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: '#fcd34d' },
  paymentWarningTitle: { color: '#92400e', fontSize: font.sm, fontWeight: '700' },
  paymentWarningText: { color: '#92400e', fontSize: font.sm },
});
