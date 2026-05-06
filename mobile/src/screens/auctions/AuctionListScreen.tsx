import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, ScrollView, Image,
  Modal, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { auctionsApi } from '../../api/auctions';
import { watchlistApi } from '../../api/watchlist';
import { useAuthStore } from '../../store/auth.store';
import { Auction, AuctionItem, AuctionGame } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { GAME_COLORS, GameKey, ALL_GAME_COLOR } from '../../theme/gameColors';
import { auctionStatusBadge } from '../../utils/auction';
import { formatMXN } from '../../utils/currency';
import { AppStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AuctionList'>;

const GAMES: { value: AuctionGame | null; label: string; emoji: string }[] = [
  { value: null,       label: 'Todos',     emoji: '🃏' },
  { value: 'pokemon',  label: 'Pokémon',   emoji: '⚡' },
  { value: 'mtg',      label: 'MTG',       emoji: '🔮' },
  { value: 'yugioh',   label: 'Yu-Gi-Oh',  emoji: '👁️' },
  { value: 'onepiece', label: 'One Piece', emoji: '🏴‍☠️' },
  { value: 'lorcana',  label: 'Lorcana',   emoji: '✨' },
  { value: 'other',    label: 'Otros',     emoji: '🎮' },
];

const CONDITIONS: { value: string; label: string }[] = [
  { value: 'mint',       label: 'Mint' },
  { value: 'near_mint',  label: 'Near Mint' },
  { value: 'excellent',  label: 'Excellent' },
  { value: 'good',       label: 'Good' },
  { value: 'played',     label: 'Played' },
];

interface Filters {
  q: string;
  game: AuctionGame | null;
  condition: string | null;
  minPrice: string;
  maxPrice: string;
}

const DEFAULT_FILTERS: Filters = { q: '', game: null, condition: null, minPrice: '', maxPrice: '' };

function activeFilterCount(f: Filters) {
  return (f.condition ? 1 : 0) + (f.minPrice ? 1 : 0) + (f.maxPrice ? 1 : 0);
}

function sellerAvgRating(seller: Auction['seller']): number | null {
  if (!seller || !seller.totalRatings) return null;
  return Math.round((seller.totalRatingPoints / seller.totalRatings) * 10) / 10;
}

function getCardPrice(auction: Auction): { label: string; value: number } | null {
  if (!auction.items?.length) return null;
  const active = auction.items.find(i => i.status === 'active');
  if (active) return { label: 'Puja actual', value: active.currentPrice };
  const pending = auction.items.filter(i => i.status === 'pending');
  if (pending.length) {
    const min = Math.min(...pending.map(i => i.startingPrice));
    return { label: 'Desde', value: min };
  }
  return null;
}

function StarRating({ rating, count }: { rating: number; count: number }) {
  const full = Math.round(rating);
  return (
    <View style={starStyles.row}>
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons key={i} name={i <= full ? 'star' : 'star-outline'} size={10} color={colors.gold} />
      ))}
      <Text style={starStyles.count}>({count})</Text>
    </View>
  );
}
const starStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  count: { color: colors.textMuted, fontSize: 10, marginLeft: 2 },
});

function GameChips({ selected, onSelect }: { selected: AuctionGame | null; onSelect: (g: AuctionGame | null) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
      {GAMES.map(g => {
        const active = g.value === selected;
        const gc = g.value ? (GAME_COLORS[g.value as GameKey] ?? ALL_GAME_COLOR) : ALL_GAME_COLOR;
        return (
          <TouchableOpacity
            key={g.value ?? 'all'}
            style={[
              styles.chip,
              active && { backgroundColor: gc.bg, borderColor: gc.bg, shadowColor: gc.bg, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },
            ]}
            onPress={() => onSelect(g.value)}
            activeOpacity={0.75}
          >
            <Text style={styles.chipEmoji}>{g.emoji}</Text>
            <Text style={[styles.chipLabel, active && { color: gc.text, fontWeight: '800' }]}>{g.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function LiveDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.8, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <View style={styles.liveDotWrap}>
      <Animated.View style={[styles.liveDotRing, { transform: [{ scale: pulse }] }]} />
      <View style={styles.liveDot} />
    </View>
  );
}

function AuctionCard({
  auction, watching, onPress, onToggleWatch,
}: {
  auction: Auction;
  watching: boolean;
  onPress: () => void;
  onToggleWatch: () => void;
}) {
  const badge = auctionStatusBadge(auction.status);
  const itemCount = auction.items?.length ?? 0;
  const isLive = auction.status === 'live';
  const gameMeta = GAMES.find(g => g.value === auction.game);
  const gc = auction.game ? (GAME_COLORS[auction.game as GameKey] ?? { bg: colors.border, text: '#fff' }) : { bg: colors.border, text: '#fff' };
  const firstImage = auction.items
    ?.slice().sort((a, b) => a.position - b.position)
    .find(i => i.imageUrls?.length)?.imageUrls?.[0];

  const price = getCardPrice(auction);
  const rating = sellerAvgRating(auction.seller);
  const totalRatings = auction.seller?.totalRatings ?? 0;
  const activeBids = auction.items?.filter(i => i.status === 'active').length ?? 0;

  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, friction: 10, tension: 200 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, friction: 5,  tension: 120 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[styles.card, isLive && styles.cardLive]}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        activeOpacity={1}
      >
        {/* Left game color accent bar */}
        <View style={[styles.gameAccentBar, { backgroundColor: gc.bg }]} />

        <View style={styles.cardInner}>
          {/* Row 1: status badge + game tag + heart */}
          <View style={styles.cardHeader}>
            <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
              {isLive ? <LiveDot /> : null}
              <Text style={styles.badgeText}>{badge.label}</Text>
            </View>
            {gameMeta && (
              <View style={[styles.gameTag, { backgroundColor: gc.bg + '28', borderColor: gc.bg + '55' }]}>
                <Text style={[styles.gameTagText, { color: gc.bg }]}>{gameMeta.emoji} {gameMeta.label}</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              style={styles.heartBtn}
              onPress={e => { e.stopPropagation?.(); onToggleWatch(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={watching ? 'heart' : 'heart-outline'}
                size={22}
                color={watching ? colors.error : colors.textMuted}
              />
            </TouchableOpacity>
          </View>

          {/* Row 2: title + image */}
          <View style={styles.cardBody}>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle} numberOfLines={2}>{auction.title}</Text>

              {/* Seller info with stars */}
              <View style={styles.sellerRow}>
                <Ionicons name="person-circle-outline" size={13} color={colors.textMuted} />
                <Text style={styles.sellerName} numberOfLines={1}>@{auction.seller?.username}</Text>
                {auction.seller?.isVerified && (
                  <Ionicons name="checkmark-circle" size={12} color="#3b82f6" />
                )}
              </View>
              {rating !== null && totalRatings > 0 && (
                <StarRating rating={rating} count={totalRatings} />
              )}

              {/* Schedule date for upcoming */}
              {auction.scheduledAt && auction.status === 'scheduled' && (
                <View style={styles.scheduleRow}>
                  <Ionicons name="calendar-outline" size={11} color={colors.accent} />
                  <Text style={styles.scheduleText}>
                    {new Date(auction.scheduledAt).toLocaleString('es-MX', {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                </View>
              )}
            </View>

            {/* Thumbnail */}
            {firstImage
              ? <Image source={{ uri: firstImage }} style={styles.thumbnail} resizeMode="contain" />
              : (
                <View style={[styles.thumbnailEmpty, { backgroundColor: gc.bg + '14' }]}>
                  <Text style={{ fontSize: 32 }}>{gameMeta?.emoji ?? '🃏'}</Text>
                </View>
              )
            }
          </View>

          {/* Row 3: stats + price */}
          <View style={styles.cardFooter}>
            <View style={styles.footerLeft}>
              <Text style={styles.itemCount}>{itemCount} {itemCount === 1 ? 'carta' : 'cartas'}</Text>
              {isLive && activeBids > 0 && (
                <View style={styles.bidsBadge}>
                  <Ionicons name="flame" size={11} color={colors.warning} />
                  <Text style={styles.bidsText}>En subasta</Text>
                </View>
              )}
            </View>
            {price && (
              <View style={styles.priceBlock}>
                <Text style={styles.priceLabel}>{price.label}</Text>
                <Text style={styles.priceValue}>{formatMXN(price.value)}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function AuctionListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [auctions, setAuctions]     = useState<Auction[]>([]);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [filters, setFilters]       = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [pending, setPending] = useState<Filters>(DEFAULT_FILTERS);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false, f: Filters = DEFAULT_FILTERS) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [auctionsRes, watchlistRes] = await Promise.all([
        auctionsApi.list({
          q: f.q || undefined,
          game: f.game ?? undefined,
          condition: f.condition ?? undefined,
          minPrice: f.minPrice ? parseInt(f.minPrice, 10) : undefined,
          maxPrice: f.maxPrice ? parseInt(f.maxPrice, 10) : undefined,
        }),
        watchlistApi.mine().catch(() => ({ data: [] as Auction[] })),
      ]);
      setAuctions(auctionsRes.data);
      setWatchedIds(new Set(watchlistRes.data.map(a => a.id)));
    } catch {
      setError('No se pudo cargar las subastas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false, filters); }, [load]);

  const handleSearch = (text: string) => {
    const next = { ...filters, q: text };
    setFilters(next);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(false, next), 350);
  };

  const handleGameSelect = (g: AuctionGame | null) => {
    const next = { ...filters, game: g, q: '' };
    setFilters(next);
    load(false, next);
  };

  const handleToggleWatch = async (auctionId: string) => {
    if (!user) return;
    const isWatching = watchedIds.has(auctionId);
    setWatchedIds(prev => {
      const next = new Set(prev);
      if (isWatching) next.delete(auctionId); else next.add(auctionId);
      return next;
    });
    try {
      if (isWatching) await watchlistApi.remove(auctionId);
      else await watchlistApi.add(auctionId);
    } catch {
      setWatchedIds(prev => {
        const next = new Set(prev);
        if (isWatching) next.add(auctionId); else next.delete(auctionId);
        return next;
      });
    }
  };

  const openFilters = () => { setPending(filters); setShowFilters(true); };

  const applyFilters = () => {
    setFilters(pending);
    setShowFilters(false);
    load(false, pending);
  };

  const clearFilters = () => {
    const next = { ...pending, condition: null, minPrice: '', maxPrice: '' };
    setPending(next);
    setFilters(next);
    setShowFilters(false);
    load(false, next);
  };

  useEffect(() => {
    const isIdle = !filters.q && !filters.game && !filters.condition && !filters.minPrice && !filters.maxPrice;
    if (!isIdle) return;
    const id = setInterval(() => load(true, DEFAULT_FILTERS), 30_000);
    return () => clearInterval(id);
  }, [load, filters]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <AppHeader filterCount={0} onOpenFilters={() => {}} searchValue="" onSearch={() => {}} />
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </View>
    );
  }

  const live     = auctions.filter(a => a.status === 'live');
  const upcoming = auctions.filter(a => a.status === 'scheduled');
  const sections = [
    ...(live.length > 0     ? [{ title: 'LIVE', data: live }]     : []),
    ...(upcoming.length > 0 ? [{ title: 'UPCOMING', data: upcoming }] : []),
  ];

  const filterCount = activeFilterCount(filters);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Branded header */}
      <AppHeader
        filterCount={filterCount}
        onOpenFilters={openFilters}
        searchValue={filters.q}
        onSearch={handleSearch}
      />

      <GameChips selected={filters.game} onSelect={handleGameSelect} />

      <SectionList
        sections={sections}
        keyExtractor={a => a.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        removeClippedSubviews
        maxToRenderPerBatch={6}
        windowSize={7}
        initialNumToRender={6}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true, filters); }} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="storefront-outline" size={44} color={colors.primary + '88'} />
            </View>
            <Text style={styles.emptyTitle}>{error ? 'Sin conexión' : 'Sin subastas'}</Text>
            <Text style={styles.emptyText}>{error ?? 'No hay subastas para estos filtros'}</Text>
            {filterCount > 0 && (
              <TouchableOpacity onPress={clearFilters} style={styles.clearLink}>
                <Text style={styles.clearLinkText}>Limpiar filtros</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          section.title === 'LIVE'
            ? <LiveBanner count={live.length} />
            : <UpcomingHeader />
        )}
        renderItem={({ item }) => (
          <AuctionCard
            auction={item}
            watching={watchedIds.has(item.id)}
            onToggleWatch={() => handleToggleWatch(item.id)}
            onPress={() => navigation.navigate('AuctionDetail', { auctionId: item.id })}
          />
        )}
      />

      {/* Filter modal */}
      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Sheet handle */}
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtros</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.filterLabel}>Condición</Text>
            <View style={styles.conditionRow}>
              {CONDITIONS.map(c => {
                const active = pending.condition === c.value;
                return (
                  <TouchableOpacity
                    key={c.value}
                    style={[styles.conditionChip, active && styles.conditionChipActive]}
                    onPress={() => setPending(p => ({ ...p, condition: active ? null : c.value }))}
                  >
                    <Text style={[styles.conditionChipLabel, active && styles.conditionChipLabelActive]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.filterLabel}>Precio inicial (MXN)</Text>
            <View style={styles.priceRow}>
              <TextInput
                style={styles.priceInput}
                value={pending.minPrice}
                onChangeText={v => setPending(p => ({ ...p, minPrice: v.replace(/[^0-9]/g, '') }))}
                placeholder="Mínimo"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
              <Text style={styles.priceSep}>—</Text>
              <TextInput
                style={styles.priceInput}
                value={pending.maxPrice}
                onChangeText={v => setPending(p => ({ ...p, maxPrice: v.replace(/[^0-9]/g, '') }))}
                placeholder="Máximo"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
                <Text style={styles.clearBtnText}>Limpiar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}>
                <Text style={styles.applyBtnText}>Aplicar filtros</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function AppHeader({
  filterCount, onOpenFilters, searchValue, onSearch,
}: {
  filterCount: number;
  onOpenFilters: () => void;
  searchValue: string;
  onSearch: (t: string) => void;
}) {
  return (
    <View style={styles.appHeader}>
      {/* Brand row */}
      <View style={styles.brandRow}>
        <View style={styles.brandGlow} />
        <Text style={styles.brandText}>TCG<Text style={styles.brandAccent}> LIVE</Text></Text>
        <View style={styles.brandDot} />
        <View style={{ flex: 1 }} />
        <View style={styles.liveIndicator}>
          <View style={styles.liveIndicatorDot} />
          <Text style={styles.liveIndicatorText}>EN VIVO</Text>
        </View>
      </View>
      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={searchValue}
          onChangeText={onSearch}
          placeholder="Buscar subastas o cartas..."
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <TouchableOpacity onPress={onOpenFilters} style={styles.filterBtn}>
          <Ionicons name="options-outline" size={20} color={filterCount > 0 ? colors.primary : colors.textMuted} />
          {filterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function LiveBanner({ count }: { count: number }) {
  const pulse = useRef(new Animated.Value(0.92)).current;
  const glow  = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1,    duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.92, duration: 750, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1,   duration: 900, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.6, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={styles.liveBannerOuter}>
      <Animated.View style={[styles.liveBannerGlow, { opacity: glow }]} />
      <View style={styles.liveBanner}>
        <View style={styles.liveBannerLeft}>
          <Animated.View style={[styles.liveBannerDot, { transform: [{ scale: pulse }] }]} />
          <Text style={styles.liveBannerText}>EN VIVO AHORA</Text>
        </View>
        <View style={styles.liveBannerCount}>
          <Ionicons name="flame" size={12} color={colors.error} />
          <Text style={styles.liveBannerCountText}>{count} activa{count !== 1 ? 's' : ''}</Text>
        </View>
      </View>
    </View>
  );
}

function UpcomingHeader() {
  return (
    <View style={styles.upcomingHeader}>
      <Ionicons name="calendar-outline" size={14} color={colors.accent} />
      <Text style={styles.upcomingTitle}>PRÓXIMAS SUBASTAS</Text>
      <View style={styles.upcomingRule} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: spacing.xxl },

  // App header
  appHeader: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.sm, gap: 6 },
  brandGlow: {
    position: 'absolute',
    left: -8,
    top: 6,
    width: 120,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '18',
  },
  brandText: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  brandAccent: { color: colors.primaryLight },
  brandDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.error },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.error + '18',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.error + '44',
  },
  liveIndicatorDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.error },
  liveIndicatorText: { color: colors.error, fontSize: font.xs, fontWeight: '800', letterSpacing: 0.8 },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 11,
    gap: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: font.md, paddingVertical: 0 },
  filterBtn: { padding: 4, position: 'relative' },
  filterBadge: {
    position: 'absolute', top: 0, right: 0,
    width: 15, height: 15, borderRadius: 8,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  filterBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // Game chips
  chipsContent: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: radius.full, borderWidth: 1.5,
    borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipEmoji: { fontSize: 13 },
  chipLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },

  // Section banners
  liveBannerOuter: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  liveBannerGlow: {
    position: 'absolute',
    inset: 0,
    backgroundColor: colors.error + '22',
    borderRadius: radius.md,
  },
  liveBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: colors.error + '66',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: colors.error + '12',
  },
  liveBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveBannerDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.error },
  liveBannerText: { color: colors.error, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  liveBannerCount: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.error + '28', borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.error + '44',
  },
  liveBannerCountText: { color: colors.error, fontSize: font.xs, fontWeight: '800' },

  upcomingHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  upcomingTitle: { color: colors.accent, fontSize: font.xs, fontWeight: '800', letterSpacing: 1.5 },
  upcomingRule: { flex: 1, height: 1, backgroundColor: colors.accent + '33' },

  // Card layout
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: 10 },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  cardLive: {
    borderColor: colors.error + 'AA',
    shadowColor: colors.error,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 7,
  },
  gameAccentBar: { width: 5, minHeight: 80 },
  cardInner: { flex: 1, padding: spacing.md, gap: spacing.sm },

  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.full, gap: 5,
  },
  badgeText: { color: colors.white, fontSize: font.xs, fontWeight: '700', letterSpacing: 0.5 },
  gameTag: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radius.full, borderWidth: 1,
  },
  gameTagText: { fontSize: font.xs, fontWeight: '700' },
  heartBtn: { padding: 4 },

  cardBody: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardInfo: { flex: 1, gap: 5 },
  cardTitle: { color: colors.text, fontSize: font.base, fontWeight: '700', lineHeight: 22 },

  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sellerName: { color: colors.textMuted, fontSize: font.sm, flexShrink: 1 },

  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  scheduleText: { color: colors.accent, fontSize: font.sm },

  thumbnail: { width: 80, height: 110, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  thumbnailEmpty: {
    width: 80, height: 110, borderRadius: radius.md,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },

  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border + '88',
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemCount: { color: colors.textMuted, fontSize: font.sm },
  bidsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.warning + '22', borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.warning + '55',
  },
  bidsText: { color: colors.warning, fontSize: font.xs, fontWeight: '700' },

  priceBlock: { alignItems: 'flex-end' },
  priceLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 0.3 },
  priceValue: { color: colors.gold, fontSize: font.xl, fontWeight: '900', letterSpacing: -0.3 },

  // Live dot
  liveDotWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  liveDotRing: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: colors.white + '44' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },

  // Empty state
  emptyContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: spacing.xl, marginTop: spacing.xxl,
  },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyTitle: { color: colors.text, fontSize: font.lg, fontWeight: '800', marginBottom: spacing.xs },
  emptyText: { color: colors.textMuted, fontSize: font.md, textAlign: 'center', lineHeight: 22 },
  clearLink: { marginTop: spacing.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  clearLinkText: {
    color: colors.primary, fontSize: font.sm, fontWeight: '700',
    textDecorationLine: 'underline',
  },

  // Filter modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl, paddingTop: spacing.md,
    gap: spacing.md,
    borderTopWidth: 1, borderColor: colors.border,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.sm,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: colors.text, fontSize: font.xl, fontWeight: '800' },
  filterLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700', letterSpacing: 0.5 },
  conditionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  conditionChip: {
    paddingHorizontal: spacing.md, paddingVertical: 7,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  conditionChipActive: { backgroundColor: colors.primary, borderColor: colors.primaryLight },
  conditionChipLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  conditionChipLabelActive: { color: '#fff', fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceInput: {
    flex: 1, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.text, fontSize: font.md,
  },
  priceSep: { color: colors.textMuted, fontSize: font.md },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  clearBtn: {
    flex: 1, padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  clearBtnText: { color: colors.textMuted, fontWeight: '700', fontSize: font.base },
  applyBtn: {
    flex: 2, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.primary, alignItems: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  applyBtnText: { color: '#fff', fontWeight: '800', fontSize: font.base, letterSpacing: 0.3 },
});
