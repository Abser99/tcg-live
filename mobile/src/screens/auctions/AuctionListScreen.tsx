import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { auctionsApi } from '../../api/auctions';
import { Auction } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { auctionStatusBadge } from '../../utils/auction';
import { AppStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AuctionList'>;

function AuctionCard({ auction, onPress }: { auction: Auction; onPress: () => void }) {
  const badge = auctionStatusBadge(auction.status);
  const itemCount = auction.items?.length ?? 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          {auction.status === 'live' && (
            <View style={styles.liveDot} />
          )}
          <Text style={styles.badgeText}>{badge.label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>{auction.title}</Text>

      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>
          <Ionicons name="person-outline" size={12} /> @{auction.seller?.username}
        </Text>
        {itemCount > 0 && (
          <Text style={styles.metaText}>
            <Ionicons name="layers-outline" size={12} /> {itemCount} {itemCount === 1 ? 'carta' : 'cartas'}
          </Text>
        )}
      </View>

      {auction.scheduledAt && auction.status === 'scheduled' && (
        <Text style={styles.scheduleText}>
          <Ionicons name="time-outline" size={12} />{' '}
          {new Date(auction.scheduledAt).toLocaleString('es-MX', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function AuctionListScreen({ navigation }: Props) {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data } = await auctionsApi.list();
      setAuctions(data);
    } catch {
      setError('No se pudo cargar las subastas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={auctions}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
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
  list: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    gap: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  badgeText: { color: colors.white, fontSize: font.sm, fontWeight: '700' },
  cardTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700', marginBottom: spacing.sm },
  cardMeta: { flexDirection: 'row', gap: spacing.md },
  metaText: { color: colors.textMuted, fontSize: font.sm },
  scheduleText: { color: colors.accent, fontSize: font.sm, marginTop: spacing.xs },
  emptyText: { color: colors.textMuted, fontSize: font.md, marginTop: spacing.md, textAlign: 'center' },
});
