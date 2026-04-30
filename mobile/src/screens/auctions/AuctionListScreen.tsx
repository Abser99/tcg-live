import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, ScrollView, Image,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { auctionsApi } from '../../api/auctions';
import { Auction, AuctionGame } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { auctionStatusBadge } from '../../utils/auction';
import { AppStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AuctionList'>;

const GAMES: { value: AuctionGame | null; label: string; emoji: string }[] = [
  { value: null,       label: 'Todos',    emoji: '🃏' },
  { value: 'pokemon',  label: 'Pokémon',  emoji: '⚡' },
  { value: 'mtg',      label: 'MTG',      emoji: '🔮' },
  { value: 'yugioh',   label: 'Yu-Gi-Oh', emoji: '👁️' },
  { value: 'onepiece', label: 'One Piece', emoji: '🏴‍☠️' },
  { value: 'lorcana',  label: 'Lorcana',  emoji: '✨' },
  { value: 'other',    label: 'Otros',    emoji: '🎮' },
];

function GameChips({
  selected,
  onSelect,
}: {
  selected: AuctionGame | null;
  onSelect: (g: AuctionGame | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipsScroll}
      contentContainerStyle={styles.chipsContent}
    >
      {GAMES.map(g => {
        const active = g.value === selected;
        return (
          <TouchableOpacity
            key={g.value ?? 'all'}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(g.value)}
            activeOpacity={0.75}
          >
            <Text style={styles.chipEmoji}>{g.emoji}</Text>
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{g.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function AuctionCard({ auction, onPress }: { auction: Auction; onPress: () => void }) {
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
    <TouchableOpacity
      style={[styles.card, isLive && styles.cardLive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          {isLive && <View style={styles.liveDot} />}
          <Text style={styles.badgeText}>{badge.label}</Text>
        </View>
        {gameMeta && <Text style={styles.gameTag}>{gameMeta.emoji} {gameMeta.label}</Text>}
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>{auction.title}</Text>
          <View style={styles.cardMeta}>
            <Text style={styles.metaText}>@{auction.seller?.username}</Text>
            {itemCount > 0 && (
              <Text style={styles.metaText}>{itemCount} {itemCount === 1 ? 'carta' : 'cartas'}</Text>
            )}
          </View>
          {auction.scheduledAt && auction.status === 'scheduled' && (
            <Text style={styles.scheduleText}>
              {new Date(auction.scheduledAt).toLocaleString('es-MX', {
                weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          )}
        </View>
        {firstImage ? (
          <Image source={{ uri: firstImage }} style={styles.thumbnail} resizeMode="contain" />
        ) : (
          <View style={styles.thumbnailEmpty}>
            <Ionicons name="layers-outline" size={22} color={colors.border} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function AuctionListScreen({ navigation }: Props) {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedGame, setSelectedGame] = useState<AuctionGame | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false, q = '', game: AuctionGame | null = null) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data } = await auctionsApi.list(q || undefined, game ?? undefined);
      setAuctions(data);
    } catch {
      setError('No se pudo cargar las subastas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false, query, selectedGame); }, [selectedGame]);
  useEffect(() => { load(); }, [load]);

  const handleSearch = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(false, text, selectedGame), 350);
  };

  const handleGameSelect = (g: AuctionGame | null) => {
    setSelectedGame(g);
    setQuery('');
    if (searchTimer.current) clearTimeout(searchTimer.current);
  };

  // Auto-refresh every 30s when idle
  useEffect(() => {
    if (query || selectedGame) return;
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [load, query, selectedGame]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const live = auctions.filter(a => a.status === 'live');
  const upcoming = auctions.filter(a => a.status === 'scheduled');

  const sections = [
    ...(live.length > 0    ? [{ title: '🔴 EN VIVO AHORA',    data: live }]     : []),
    ...(upcoming.length > 0 ? [{ title: 'PRÓXIMAS SUBASTAS', data: upcoming }] : []),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={handleSearch}
          placeholder="Buscar subastas..."
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      <GameChips selected={selectedGame} onSelect={handleGameSelect} />
      <SectionList
        sections={sections}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true, query, selectedGame); }}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="storefront-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {error ?? 'No hay subastas activas por ahora'}
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, section.title.startsWith('🔴') && styles.liveTitle]}>
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <AuctionCard
            auction={item}
            onPress={() => navigation.navigate('AuctionDetail', { auctionId: item.id })}
          />
        )}
      />
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
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
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
  emptyText: { color: colors.textMuted, fontSize: font.md, marginTop: spacing.md, textAlign: 'center' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: font.md, paddingVertical: 4 },
  chipsScroll: { borderBottomWidth: 1, borderBottomColor: colors.border, maxHeight: 52 },
  chipsContent: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipEmoji: { fontSize: 13 },
  chipLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  chipLabelActive: { color: '#fff' },
});
