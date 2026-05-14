import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Image, Animated,
  KeyboardAvoidingView, Platform, Share, Modal, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import { auctionsApi } from '../../api/auctions';
import { paymentMethodsApi } from '../../api/paymentMethods';
import { watchlistApi } from '../../api/watchlist';
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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = screenWidth > screenHeight;

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
  const [streamTokenError, setStreamTokenError] = useState(false);
  const [fetchingStreamToken, setFetchingStreamToken] = useState(false);
  const [hasPayment, setHasPayment] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [showStreamChat, setShowStreamChat] = useState(false);

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const chatListRef = useRef<ScrollView>(null);

  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [watching, setWatching] = useState(false);
  const [watchingBusy, setWatchingBusy] = useState(false);

  const socketRef  = useRef<Socket | null>(null);
  const userIdRef  = useRef<string | undefined>(user?.id);
  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);
  const urgentPulse = useRef(new Animated.Value(1)).current;
  const urgentAnim = useRef<Animated.CompositeAnimation | null>(null);

  const fetchStreamToken = useCallback(async () => {
    setFetchingStreamToken(true);
    setStreamTokenError(false);
    try {
      const { data } = await auctionsApi.getLiveKitToken(auctionId);
      setStreamCreds(data);
    } catch {
      setStreamTokenError(true);
      setStreamCreds(null);
    } finally {
      setFetchingStreamToken(false);
    }
  }, [auctionId]);

  const load = useCallback(async () => {
    try {
      const [auctionRes, tokenRes, watchRes] = await Promise.all([
        auctionsApi.get(auctionId),
        auctionsApi.getLiveKitToken(auctionId).catch(() => null),
        watchlistApi.status(auctionId).catch(() => ({ data: { watching: false } })),
      ]);
      setAuction(auctionRes.data);
      navigation.setOptions({ title: auctionRes.data.title });
      setWatching(watchRes.data.watching);
      if (tokenRes) {
        setStreamCreds(tokenRes.data);
        setStreamTokenError(false);
      } else {
        setStreamTokenError(true);
      }
      const active = auctionRes.data.items?.find((i) => i.status === 'active') ?? null;
      setActiveItem(active);
      if (active) {
        const { data: bids } = await auctionsApi.getItemBids(active.id);
        setRecentBids(bids.slice(0, 10));
      }
      // Payment method check disabled until Mercado Pago credentials are active
      // if (auctionRes.data.status === 'live' && auctionRes.data.sellerId !== userIdRef.current) {
      //   const { data } = await paymentMethodsApi.hasAny();
      //   setHasPayment(data.hasPaymentMethod);
      // }
      setHasPayment(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? String(err);
      console.error('[AuctionDetail] load error:', msg, err);
      Alert.alert('Error', `No se pudo cargar la subasta\n${msg}`);
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.navigate('AuctionList');
    } finally {
      setLoading(false);
    }
  }, [auctionId]);

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

  useEffect(() => {
    startCountdown(activeItem?.closesAt ?? null);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeItem?.id, activeItem?.closesAt, startCountdown]);

  useEffect(() => {
    if (secondsLeft !== null && secondsLeft <= 10) {
      urgentAnim.current?.stop();
      urgentAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(urgentPulse, { toValue: 1.08, duration: 400, useNativeDriver: true }),
          Animated.timing(urgentPulse, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]),
      );
      urgentAnim.current.start();
    } else {
      urgentAnim.current?.stop();
      urgentPulse.setValue(1);
    }
  }, [secondsLeft]);

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

  useEffect(() => {
    if (!token) return;
    const socket = io(`${WS_URL}/auctions`, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;
    socket.on('connect', () => { setConnected(true); socket.emit('join-auction', auctionId); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('bid:placed', (data) => {
      setActiveItem((prev) => prev ? ({
        ...prev,
        currentPrice: data.amount as number,
        winnerId: data.bidderId as string,
        closesAt: (data.closesAt as string | null) ?? prev.closesAt,
      }) : null);
      if (data.closesAt) startCountdown(data.closesAt as string);
      setRecentBids((prev) => [{
        id: data.bidId, auctionItemId: data.itemId, bidderId: data.bidderId,
        bidder: { username: data.bidderUsername as string } as Bid['bidder'],
        amount: data.amount, createdAt: data.timestamp,
      }, ...prev.slice(0, 9)]);
    });
    socket.on('item:closed', (data) => {
      setActiveItem((prev) => prev?.id === data.itemId ? ({ ...prev, status: data.status as AuctionItem['status'] } as AuctionItem) : prev);
      if (data.nextItemId) { load(); if (data.nextClosesAt) startCountdown(data.nextClosesAt as string); }
      else startCountdown(null);
    });
    socket.on('auction:started', () => load());
    socket.on('auction:ended', () => setAuction((prev) => prev ? { ...prev, status: 'ended' } : prev));
    socket.on('chat:message', (msg: ChatMessage) => setChatMessages((prev) => [...prev.slice(-99), msg]));
    socket.on('reaction', (r: Reaction) => spawnFloatingReaction(r));
    socket.on('viewer:count', ({ count }: { count: number }) => setViewerCount(count));
    return () => { socket.emit('leave-auction', auctionId); socket.disconnect(); };
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

  const handleBuyNow = async () => {
    if (!activeItem?.binPrice) return;
    Alert.alert(
      'Comprar ahora',
      `¿Comprar "${activeItem.cardName}" por ${formatMXN(activeItem.binPrice)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setBidding(true);
            try { await auctionsApi.placeBid(activeItem.id, activeItem.binPrice!); }
            catch (err: any) { Alert.alert('Error', err.response?.data?.message ?? 'No se pudo completar la compra'); }
            finally { setBidding(false); }
          },
        },
      ],
    );
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

  const sendReaction = (emoji: string) => socketRef.current?.emit('reaction:send', emoji);

  const toggleWatch = async () => {
    if (watchingBusy) return;
    setWatchingBusy(true);
    try {
      if (watching) { await watchlistApi.remove(auctionId); setWatching(false); }
      else { await watchlistApi.add(auctionId); setWatching(true); }
    } catch { Alert.alert('Error', 'No se pudo actualizar la lista de guardados'); }
    finally { setWatchingBusy(false); }
  };

  if (loading || !auction) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const isLive = auction.status === 'live';
  const isSeller = auction.sellerId === user?.id;
  const minBid = activeItem ? (activeItem.currentPrice / 100) + 1 : 0;
  const cardImageWidth = Math.min(screenWidth * 0.33, 140);
  const cardImageHeight = cardImageWidth * (196 / 140);
  const isWinning = activeItem?.winnerId === user?.id;
  const bottomPad = Math.max(insets.bottom, 4);

  // ── Reusable inline JSX blocks (NOT components — avoids remount on every render) ──

  const streamChatOverlayJsx = showStreamChat && (
    <View style={[styles.streamChatOverlay, { zIndex: 2 }]} pointerEvents="none">
      {chatMessages.slice(-8).map((msg, i) => (
        <Text key={`overlay-${msg.timestamp}-${i}`} style={styles.streamChatLine} numberOfLines={1}>
          <Text style={styles.streamChatUser}>@{msg.username} </Text>
          {msg.message}
        </Text>
      ))}
    </View>
  );

  const streamBlock = (fill?: boolean) => {
    if (!isLive) return null;

    const wrapStyle = [styles.streamWrap, fill && styles.streamWrapFill];

    if (fetchingStreamToken) {
      return (
        <View style={[styles.streamPlaceholder, fill && styles.streamWrapFill]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.streamPlaceholderText}>Cargando stream...</Text>
        </View>
      );
    }

    if (streamTokenError || !streamCreds) {
      return (
        <View style={[styles.streamPlaceholder, fill && styles.streamWrapFill]}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.error + '88'} />
          <Text style={styles.streamPlaceholderText}>Stream no disponible</Text>
          <TouchableOpacity style={styles.streamRetryBtn} onPress={fetchStreamToken}>
            <Ionicons name="refresh-outline" size={16} color={colors.white} />
            <Text style={styles.streamRetryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={wrapStyle}>
        <StreamViewer
          wsUrl={streamCreds.wsUrl}
          token={streamCreds.token}
          fill={fill}
          onRetry={fetchStreamToken}
        />
        <TouchableOpacity
          style={[StyleSheet.absoluteFillObject, { zIndex: 1 }]}
          onPress={() => setShowStreamChat(p => !p)}
          activeOpacity={1}
        />
        {streamChatOverlayJsx}
        <View style={[styles.reactionsOverlay, { zIndex: 3 }]} pointerEvents="none">
          {floatingReactions.map((r) => <FloatingEmoji key={r.localId} item={r} />)}
        </View>
      </View>
    );
  };

  const bidSectionJsx = isLive && !isSeller && activeItem && hasPayment ? (
    <View style={styles.bidSection}>
      <View style={styles.bidPriceRow}>
        <Text style={styles.bidCurrentPrice}>{formatMXN(activeItem.currentPrice)}</Text>
        {secondsLeft !== null && (
          <Animated.View
            style={[
              styles.timerBadge,
              secondsLeft <= 10 && styles.timerBadgeUrgent,
              { transform: [{ scale: urgentPulse }] },
            ]}
          >
            <Ionicons name="timer-outline" size={12} color={secondsLeft <= 10 ? colors.white : colors.textMuted} />
            <Text style={[styles.timerText, secondsLeft <= 10 && styles.timerTextUrgent]}>
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
            </Text>
          </Animated.View>
        )}
        <TouchableOpacity
          style={[styles.maxBidToggle, showMaxBid && styles.maxBidToggleActive]}
          onPress={() => setShowMaxBid(p => !p)}
        >
          <Ionicons name="trending-up-outline" size={15} color={showMaxBid ? colors.white : colors.textMuted} />
          <Text style={[styles.maxBidToggleText, showMaxBid && { color: colors.white }]}>Máx</Text>
        </TouchableOpacity>
      </View>
      {activeItem.binPrice && activeItem.binPrice > activeItem.currentPrice && (
        <TouchableOpacity style={styles.binBtn} onPress={handleBuyNow} disabled={bidding}>
          <Ionicons name="flash" size={15} color="#fff" />
          <Text style={styles.binBtnText}>Comprar ahora · {formatMXN(activeItem.binPrice)}</Text>
        </TouchableOpacity>
      )}
      <TextInput
        style={styles.bidInput}
        placeholder={`Mín. $${minBid.toFixed(2)}`}
        placeholderTextColor={colors.textMuted}
        value={bidAmount}
        onChangeText={setBidAmount}
        keyboardType="decimal-pad"
      />
      <SliderButton label="Desliza para ofertar" onSlide={handleBid} disabled={!bidAmount.trim()} loading={bidding} />
      {showMaxBid && (
        <>
          <TextInput
            style={[styles.bidInput, { borderColor: colors.accent }]}
            placeholder="Oferta máxima (MXN)"
            placeholderTextColor={colors.textMuted}
            value={maxBidAmount}
            onChangeText={setMaxBidAmount}
            keyboardType="decimal-pad"
          />
          <SliderButton
            label="Desliza para activar oferta máxima"
            onSlide={handleSetMaxBid}
            disabled={!maxBidAmount.trim()}
            loading={settingMaxBid}
            color={colors.accent}
          />
        </>
      )}
    </View>
  ) : null;

  const chatMessagesJsx = (
    <ScrollView
      ref={chatListRef}
      style={styles.chatMessages}
      contentContainerStyle={styles.chatMessagesContent}
      onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: false })}
    >
      {chatMessages.length === 0
        ? <Text style={styles.chatEmpty}>Sé el primero 👋</Text>
        : chatMessages.slice(-30).map((msg, i) => (
            <Text key={`${msg.timestamp}-${i}`} style={styles.chatLine} numberOfLines={2}>
              <Text style={[styles.chatUser, msg.userId === user?.id && styles.chatUserMe]}>
                @{msg.username}{' '}
              </Text>
              {msg.message}
            </Text>
          ))
      }
    </ScrollView>
  );

  const chatBarJsx = (
    <View style={[styles.chatBar, { paddingBottom: bottomPad }]}>
      <View style={styles.emojiRow}>
        {REACTION_EMOJIS.map((emoji) => (
          <TouchableOpacity key={emoji} style={styles.emojiBtn} onPress={() => sendReaction(emoji)}>
            <Text style={styles.emojiBtnText}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.chatInputRow}>
        <TextInput
          style={styles.chatInput}
          placeholder="Mensaje..."
          placeholderTextColor={colors.textMuted}
          value={chatText}
          onChangeText={setChatText}
          onSubmitEditing={sendChat}
          returnKeyType="send"
          maxLength={200}
          blurOnSubmit={false}
        />
        <TouchableOpacity style={[styles.chatSend, { opacity: chatText.trim() ? 1 : 0.4 }]} onPress={sendChat} disabled={!chatText.trim()}>
          <Ionicons name="send" size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* ── Scrollable upper content ── */}
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={[styles.badge, { backgroundColor: isLive ? colors.error : colors.textMuted }]}>
              {isLive && <View style={styles.liveDot} />}
              <Text style={styles.badgeText}>{isLive ? 'EN VIVO' : auction.status.toUpperCase()}</Text>
            </View>
            {isLive && viewerCount > 0 && (
              <View style={styles.viewerBadge}>
                <Ionicons name="eye-outline" size={12} color={colors.textMuted} />
                <Text style={styles.viewerText}>{viewerCount}</Text>
              </View>
            )}
            {!isSeller && auction.status !== 'ended' && auction.status !== 'cancelled' && (
              <TouchableOpacity onPress={toggleWatch} disabled={watchingBusy} style={styles.bookmarkBtn}>
                <Ionicons name={watching ? 'bookmark' : 'bookmark-outline'} size={20} color={watching ? colors.primary : colors.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.bookmarkBtn}
              onPress={() => Share.share({ message: `Mira esta subasta en TCG Live: "${auction.title}"\ntcglive://auction/${auctionId}` })}
            >
              <Ionicons name="share-social-outline" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            {isLive && (
              <TouchableOpacity style={styles.bookmarkBtn} onPress={() => setFullscreen(true)}>
                <Ionicons name="expand-outline" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            <View style={[styles.wsIndicator, { backgroundColor: connected ? colors.success : colors.textMuted }]} />
          </View>

          {/* Payment warning */}
          {isLive && !isSeller && !hasPayment && (
            <TouchableOpacity style={styles.paymentWarning} onPress={() => navigation.navigate('Profile' as any)} activeOpacity={0.8}>
              <Ionicons name="warning-outline" size={18} color="#92400e" />
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentWarningTitle}>Sin forma de pago</Text>
                <Text style={styles.paymentWarningText}>Agrega una tarjeta u OXXO para poder ofertar · Toca aquí</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Stream */}
          {streamBlock()}

          {/* Buyer live view: just winning status */}
          {isLive && !isSeller && activeItem && (
            <View style={[styles.winningBanner, isWinning ? styles.winningBannerGreen : activeItem.winnerId ? styles.winningBannerOrange : styles.winningBannerNeutral]}>
              <Ionicons
                name={isWinning ? 'trophy' : activeItem.winnerId ? 'arrow-up-circle-outline' : 'time-outline'}
                size={18}
                color={isWinning ? colors.gold : activeItem.winnerId ? colors.error : colors.textMuted}
              />
              <Text style={[styles.winningText, { color: isWinning ? colors.gold : activeItem.winnerId ? colors.error : colors.textMuted }]}>
                {isWinning ? '¡Vas ganando!' : activeItem.winnerId ? 'Alguien más va adelante' : `Precio inicial · ${activeItem.cardName}`}
              </Text>
            </View>
          )}

          {/* Seller/non-live: show full details */}
          {(!isLive || isSeller) && (
            <>
              <Text style={styles.title}>{auction.title}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('SellerProfile', { sellerId: auction.sellerId })}>
                <Text style={styles.seller}>@{auction.seller?.username} →</Text>
              </TouchableOpacity>
              {auction.description ? <Text style={styles.description}>{auction.description}</Text> : null}

              {activeItem && (
                <View style={styles.activeCard}>
                  {activeItem.imageUrls && activeItem.imageUrls.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll} contentContainerStyle={styles.imageScrollContent}>
                      {activeItem.imageUrls.map((url, i) => (
                        <Image key={i} source={{ uri: url }} style={[styles.cardImage, { width: cardImageWidth, height: cardImageHeight }]} resizeMode="contain" />
                      ))}
                    </ScrollView>
                  )}
                  <View style={styles.activeCardBody}>
                    <Text style={styles.sectionLabel}>SUBASTA ACTUAL</Text>
                    <Text style={styles.cardName}>{activeItem.cardName}</Text>
                    {activeItem.cardSet && <Text style={styles.cardMeta}>{activeItem.cardSet}{activeItem.cardNumber ? ` · #${activeItem.cardNumber}` : ''}</Text>}
                    <View style={styles.conditionRow}>
                      <Text style={styles.cardMeta}>{CONDITIONS[activeItem.condition]}</Text>
                      {activeItem.gradingCompany && activeItem.grade && (
                        <View style={styles.gradeBadge}>
                          <Text style={styles.gradeBadgeText}>{activeItem.gradingCompany} {activeItem.grade}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.priceRow}>
                      <View>
                        <Text style={styles.priceLabel}>Precio actual</Text>
                        <Text style={styles.price}>{formatMXN(activeItem.currentPrice)}</Text>
                      </View>
                      {activeItem.binPrice && (
                        <View style={styles.binPriceBadge}>
                          <Ionicons name="flash-outline" size={12} color={colors.success} />
                          <Text style={styles.binPriceText}>BIN {formatMXN(activeItem.binPrice)}</Text>
                        </View>
                      )}
                      {activeItem.winnerId && (
                        <View style={styles.winnerBadge}>
                          <Ionicons name="trophy-outline" size={14} color={colors.warning} />
                          <Text style={styles.winnerText}>{activeItem.winnerId === user?.id ? 'Tu oferta' : 'Alguien ofertó'}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              )}

              {recentBids.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>OFERTAS RECIENTES</Text>
                  {recentBids.map((bid, index) => (
                    <View
                      key={bid.id}
                      style={[
                        styles.bidRow2,
                        index === 0 && { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm },
                      ]}
                    >
                      <Text style={styles.bidUser}>@{bid.bidder?.username}</Text>
                      <Text style={[styles.bidAmt, bid.bidderId === user?.id && styles.myBid]}>{formatMXN(bid.amount)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {auction.items && auction.items.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>COLA DE CARTAS</Text>
                  {[...auction.items].sort((a, b) => a.position - b.position).map((item) => (
                    <View key={item.id} style={[styles.itemRow, item.status === 'active' && styles.itemActive]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.cardName}</Text>
                        {item.cardSet && <Text style={styles.itemMeta}>{item.cardSet}</Text>}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.itemPrice, item.status === 'active' && { color: colors.gold, fontWeight: '900' }]}>{formatMXN(item.currentPrice)}</Text>
                        <Text style={[styles.itemStatus, { color: item.status === 'sold' ? colors.success : colors.textMuted }]}>
                          {item.status === 'active' ? '▶ activa' : item.status === 'sold' ? '✓ vendida' : item.status === 'pending' ? 'pendiente' : 'no vendida'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* ── Fixed live bottom panel ── */}
        {isLive && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.livePanel}>
              {bidSectionJsx}
              {chatMessagesJsx}
              {chatBarJsx}
            </View>
          </KeyboardAvoidingView>
        )}
      </View>

      {/* ── Fullscreen Modal ── */}
      {isLive && streamCreds && (
        <Modal visible={fullscreen} onRequestClose={() => setFullscreen(false)} animationType="slide" statusBarTranslucent>
          <View style={[styles.fsContainer, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
            <View style={[styles.fsStreamWrap, isLandscape && styles.fsStreamWrapFill]}>
              <StreamViewer wsUrl={streamCreds.wsUrl} token={streamCreds.token} fill={isLandscape} onRetry={fetchStreamToken} />
              <TouchableOpacity
                style={[StyleSheet.absoluteFillObject, { zIndex: 1 }]}
                onPress={() => setShowStreamChat(p => !p)}
                activeOpacity={1}
              />
              {streamChatOverlayJsx}
              <View style={[styles.reactionsOverlay, { zIndex: 3 }]} pointerEvents="none">
                {floatingReactions.map((r) => <FloatingEmoji key={r.localId} item={r} />)}
              </View>
              <TouchableOpacity style={[styles.fsCloseBtn, { zIndex: 4 }]} onPress={() => setFullscreen(false)}>
                <Ionicons name="close" size={24} color={colors.white} />
              </TouchableOpacity>
              {viewerCount > 0 && (
                <View style={[styles.fsViewerBadge, { zIndex: 4 }]}>
                  <Ionicons name="eye-outline" size={12} color={colors.white} />
                  <Text style={styles.fsViewerText}>{viewerCount}</Text>
                </View>
              )}
            </View>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: isLandscape ? 1 : undefined }}>
              <View style={styles.livePanel}>
                {bidSectionJsx}
                {chatMessagesJsx}
                {chatBarJsx}
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.lg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    marginBottom: spacing.sm, flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: 5,
    borderRadius: radius.full, gap: 5,
    shadowColor: colors.error, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 5,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.white },
  badgeText: { color: colors.white, fontSize: font.sm, fontWeight: '800', letterSpacing: 0.5 },
  wsIndicator: { width: 8, height: 8, borderRadius: 4, marginLeft: 'auto' },
  bookmarkBtn: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
    borderRadius: 17, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.border,
  },
  viewerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.border,
  },
  viewerText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700' },

  streamWrap: { position: 'relative', marginBottom: spacing.sm, overflow: 'hidden', borderRadius: radius.lg, aspectRatio: 16 / 9, backgroundColor: colors.surface },
  streamWrapFill: { aspectRatio: undefined, flex: 1, borderRadius: 0 },
  streamPlaceholder: {
    aspectRatio: 16 / 9, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    marginBottom: spacing.sm, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  streamPlaceholderText: { color: colors.textMuted, fontSize: font.sm },
  streamRetryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.primary, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderRadius: radius.md, marginTop: spacing.xs,
  },
  streamRetryText: { color: colors.white, fontSize: font.sm, fontWeight: '700' },
  reactionsOverlay: { position: 'absolute', bottom: 8, right: 8, width: 44, height: 100, justifyContent: 'flex-end', alignItems: 'center' },
  floatingEmoji: { position: 'absolute', fontSize: 26 },
  streamChatOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.sm, gap: 2, backgroundColor: 'rgba(0,0,0,0.55)' },
  streamChatLine: { color: colors.white, fontSize: font.sm, lineHeight: 17 },
  streamChatUser: { color: colors.gold, fontWeight: '700', fontSize: font.sm },

  winningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderLeftWidth: 4,
  },
  winningBannerGreen: {
    backgroundColor: colors.gold + '18', borderColor: colors.gold + '66', borderLeftColor: colors.gold,
    shadowColor: colors.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6,
  },
  winningBannerOrange: {
    backgroundColor: colors.error + '18', borderColor: colors.error + '55', borderLeftColor: colors.error,
    shadowColor: colors.error, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  winningBannerNeutral: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderLeftColor: colors.textMuted + '88' },
  winningText: { fontSize: font.base, fontWeight: '800', flex: 1, letterSpacing: -0.1 },

  paymentWarning: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: '#fef3c7', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: '#fcd34d' },
  paymentWarningTitle: { color: '#92400e', fontSize: font.sm, fontWeight: '700' },
  paymentWarningText: { color: '#92400e', fontSize: font.sm },

  title: { color: colors.text, fontSize: font.xl, fontWeight: '800', marginBottom: spacing.xs },
  seller: { color: colors.textMuted, fontSize: font.md, marginBottom: spacing.md },
  description: { color: colors.textMuted, fontSize: font.md, marginBottom: spacing.md },
  activeCard: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.primary, marginBottom: spacing.md },
  imageScroll: { marginBottom: spacing.sm },
  imageScrollContent: { padding: spacing.sm, gap: spacing.sm },
  cardImage: { borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  activeCardBody: { padding: spacing.md, gap: spacing.xs },
  sectionLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.xs },
  cardName: { color: colors.text, fontSize: font.xl, fontWeight: '800' },
  cardMeta: { color: colors.textMuted, fontSize: font.md },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  priceLabel: { color: colors.textMuted, fontSize: font.sm },
  price: { color: colors.gold, fontSize: font.xxl, fontWeight: '800' },
  winnerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  winnerText: { color: colors.warning, fontSize: font.sm },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  bidRow2: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border + '44', paddingHorizontal: spacing.sm },
  bidUser: { color: colors.textMuted, fontSize: font.md },
  bidAmt: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  myBid: { color: colors.gold },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemActive: { backgroundColor: colors.primary + '18', marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: colors.primary },
  itemName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  itemMeta: { color: colors.textMuted, fontSize: font.sm },
  itemPrice: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  itemStatus: { fontSize: font.sm },

  // ── Live panel ──
  livePanel: {
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 14,
  },
  bidSection: { padding: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  bidPriceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bidCurrentPrice: { color: colors.gold, fontSize: font.xxl, fontWeight: '900', flex: 1, letterSpacing: -0.5 },
  timerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.sm, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
  },
  timerBadgeUrgent: { backgroundColor: colors.error, borderColor: colors.error + 'AA' },
  timerText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '800', fontVariant: ['tabular-nums'] as any },
  timerTextUrgent: { color: colors.white },
  maxBidToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceAlt,
  },
  maxBidToggleActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  maxBidToggleText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700' },
  bidInput: {
    backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12,
    color: colors.text, fontSize: font.base, fontWeight: '600',
  },
  binBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#059669', borderRadius: radius.md, paddingVertical: spacing.md,
    shadowColor: colors.success, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 8, elevation: 6,
  },
  binBtnText: { color: '#fff', fontSize: font.base, fontWeight: '900', letterSpacing: 0.6 },
  conditionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  gradeBadge: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 4 },
  gradeBadgeText: { color: '#fff', fontSize: font.sm, fontWeight: '900', letterSpacing: 0.6 },
  binPriceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.success + '22', borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.success + '55',
  },
  binPriceText: { color: colors.success, fontSize: font.sm, fontWeight: '800' },

  chatMessages: { maxHeight: 110, backgroundColor: colors.bg },
  chatMessagesContent: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  chatLine: { color: colors.text, fontSize: font.sm, lineHeight: 19, paddingVertical: 1.5, paddingHorizontal: spacing.xs },
  chatUser: { color: colors.accent, fontSize: font.sm, fontWeight: '800' },
  chatUserMe: { color: colors.primaryLight },
  chatEmpty: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center', paddingVertical: spacing.sm, fontStyle: 'italic' },

  chatBar: { borderTopWidth: 1, borderTopColor: colors.border },
  emojiRow: {
    flexDirection: 'row', justifyContent: 'space-evenly',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border + '88',
  },
  emojiBtn: {
    width: 42, height: 42, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.full, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.border,
  },
  emojiBtnText: { fontSize: 20 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 6, gap: spacing.xs },
  chatInput: {
    flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.full,
    borderWidth: 1.5, borderColor: colors.border, color: colors.text,
    fontSize: font.base, paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  chatSend: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderRadius: 19, backgroundColor: colors.primary,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },

  // ── Fullscreen ──
  fsContainer: { flex: 1, backgroundColor: '#000' },
  fsStreamWrap: { width: '100%', position: 'relative', backgroundColor: '#000', aspectRatio: 16 / 9 },
  fsStreamWrapFill: { aspectRatio: undefined, flex: 1 },
  fsCloseBtn: { position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: 7 },
  fsViewerBadge: { position: 'absolute', top: 14, right: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  fsViewerText: { color: colors.white, fontSize: font.sm, fontWeight: '600' },
});
