import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, ScrollView, Image,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { auctionsApi } from '../../api/auctions';
import { watchlistApi } from '../../api/watchlist';
import { Auction, AuctionGame } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { auctionStatusBadge } from '../../utils/auction';
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

function GameChips({ selected, onSelect }: { selected: AuctionGame | null; onSelect: (g: AuctionGame | null) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContent}>
      {GAMES.map(g => {
        const active = g.value === selected;
        return (
          <TouchableOpacity key={g.value ?? 'all'} style={[styles.chip, active && styles.chipActive]} onPress={() => onSelect(g.value)} activeOpacity={0.75}>
            <Text style={styles.chipEmoji}>{g.emoji}</Text>
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{g.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function AuctionCard({ auction, onPress, watching }: { auction: Auction; onPress: () => void; watching?: boolean }) {
  const badge = auctionStatusBadge(auction.status);
  const itemCount = auction.items?.length ?? 0;
  const isLive = auction.status === 'live';
  const gameMeta = GAMES.find(g => g.value === auction.game);
  const firstImage = auction.items
    ?.slice()
    .sort((a, b) => a.position - b.position)
    .find(i => i.imageUrls?.length)
    ?.imageUrls?.[0];

  return (
    <TouchableOpacity style={[styles.card, isLive && styles.cardLive]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          {isLive && <View style={styles.liveDot} />}
          <Text style={styles.badgeText}>{badge.label}</Text>
        </View>
        {gameMeta && <Text style={styles.gameTag}>{gameMeta.emoji} {gameMeta.label}</Text>}
        {watching && <Ionicons name="bookmark" size={14} color={colors.primary} />}
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>{auction.title}</Text>
          <View style={styles.cardMeta}>
            <Text style={styles.metaText}>@{auction.seller?.username}</Text>
            {itemCount > 0 && <Text style={styles.metaText}>{itemCount} {itemCount === 1 ? 'carta' : 'cartas'}</Text>}
          </View>
          {auction.scheduledAt && auction.status === 'scheduled' && (
            <Text style={styles.scheduleText}>
              {new Date(auction.scheduledAt).toLocaleString('es-MX', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>
        {firstImage
          ? <Image source={{ uri: firstImage }} style={styles.thumbnail} resizeMode="contain" />
          : <View style={styles.thumbnailEmpty}><Ionicons name="layers-outline" size={22} color={colors.border} /></View>
        }
      </View>
    </TouchableOpacity>
  );
}

export default function AuctionListScreen({ navigation }: Props) {
  const [auctions, setAuctions]     = useState<Auction[]>([]);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [filters, setFilters]       = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  // Pending state inside the modal — applied only on "Aplicar"
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
    if (searchTimer.current) clearTimeout(searchTimer.current);
    load(false, next);
  };

  const openFilters = () => {
    setPending(filters);
    setShowFilters(true);
  };

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

  // Auto-refresh every 30s only when fully idle
  useEffect(() => {
    const isIdle = !filters.q && !filters.game && !filters.condition && !filters.minPrice && !filters.maxPrice;
    if (!isIdle) return;
    const id = setInterval(() => load(true, DEFAULT_FILTERS), 30_000);
    return () => clearInterval(id);
  }, [load, filters]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const live     = auctions.filter(a => a.status === 'live');
  const upcoming = auctions.filter(a => a.status === 'scheduled');
  const sections = [
    ...(live.length > 0     ? [{ title: '🔴 EN VIVO AHORA',   data: live }]     : []),
    ...(upcoming.length > 0 ? [{ title: 'PRÓXIMAS SUBASTAS', data: upcoming }] : []),
  ];

  const filterCount = activeFilterCount(filters);

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={filters.q}
          onChangeText={handleSearch}
          placeholder="Buscar subastas o cartas..."
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <TouchableOpacity onPress={openFilters} style={styles.filterBtn}>
          <Ionicons name="options-outline" size={20} color={filterCount > 0 ? colors.primary : colors.textMuted} />
          {filterCount > 0 && <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{filterCount}</Text></View>}
        </TouchableOpacity>
      </View>

      <GameChips selected={filters.game} onSelect={handleGameSelect} />

      <SectionList
        sections={sections}
        keyExtractor={a => a.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true, filters); }} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="storefront-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>{error ?? 'No hay subastas para estos filtros'}</Text>
            {filterCount > 0 && (
              <TouchableOpacity onPress={clearFilters} style={styles.clearLink}>
                <Text style={styles.clearLinkText}>Limpiar filtros</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, section.title.startsWith('🔴') && styles.liveTitle]}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <AuctionCard
            auction={item}
            watching={watchedIds.has(item.id)}
            onPress={() => navigation.navigate('AuctionDetail', { auctionId: item.id })}
          />
        )}
      />

      {/* Filter modal */}
      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtros</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
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
                <Text style={styles.applyBtnText}>Aplicar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: spacing.xxl },
  list: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  sectionHeader: { paddingVertical: spacing.sm },
  sectionTitle: { color: colors.textMuted, fontSize: font.sm, fontWeight: '800', letterSpacing: 1 },
  liveTitle: { color: colors.error },
  emptyText: { color: colors.textMuted, fontSize: font.md, marginTop: spacing.md, textAlign: 'center' },
  clearLink: { marginTop: spacing.sm },
  clearLinkText: { color: colors.primary, fontSize: font.sm, fontWeight: '700' },
  // Card
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardLive: { borderColor: colors.error, borderWidth: 1.5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.xs },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  badgeText: { color: colors.white, fontSize: font.sm, fontWeight: '700' },
  gameTag: { color: colors.textMuted, fontSize: font.xs, flex: 1 },
  cardBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardInfo: { flex: 1, gap: 4 },
  cardTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', gap: spacing.md },
  metaText: { color: colors.textMuted, fontSize: font.sm },
  scheduleText: { color: colors.accent, fontSize: font.sm },
  thumbnail: { width: 56, height: 78, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  thumbnailEmpty: { width: 56, height: 78, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
  // Search bar
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  searchInput: { flex: 1, color: colors.text, fontSize: font.md, paddingVertical: 4 },
  filterBtn: { padding: 4, position: 'relative' },
  filterBadge: { position: 'absolute', top: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  filterBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  // Game chips
  chipsScroll: { borderBottomWidth: 1, borderBottomColor: colors.border, maxHeight: 52 },
  chipsContent: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipEmoji: { fontSize: 13 },
  chipLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  chipLabelActive: { color: '#fff' },
  // Filter modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: colors.text, fontSize: font.xl, fontWeight: '800' },
  filterLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700', letterSpacing: 0.5 },
  conditionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  conditionChip: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  conditionChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  conditionChipLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  conditionChipLabelActive: { color: '#fff' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceInput: { flex: 1, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text, fontSize: font.md },
  priceSep: { color: colors.textMuted, fontSize: font.md },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  clearBtn: { flex: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  clearBtnText: { color: colors.textMuted, fontWeight: '700', fontSize: font.base },
  applyBtn: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: font.base },
});
