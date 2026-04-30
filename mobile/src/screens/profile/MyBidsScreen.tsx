import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, RefreshControl, Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { auctionsApi } from '../../api/auctions';
import { useAuthStore } from '../../store/auth.store';
import { MyBidEntry } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { formatMXN } from '../../utils/currency';
import { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'MyBids'>;

function bidStatusLabel(entry: MyBidEntry, userId: string): { label: string; color: string; icon: string } {
  const { item, auction } = entry;
  if (auction.status === 'live' || auction.status === 'scheduled') {
    if (item.status === 'active') {
      return item.winnerId === userId
        ? { label: 'Ganando', color: colors.success ?? '#22c55e', icon: 'trending-up-outline' }
        : { label: 'Superado', color: colors.error ?? '#ef4444', icon: 'trending-down-outline' };
    }
    if (item.status === 'pending') {
      return { label: 'En espera', color: colors.textMuted, icon: 'time-outline' };
    }
  }
  if (item.status === 'sold') {
    return item.winnerId === userId
      ? { label: 'Ganaste', color: colors.success ?? '#22c55e', icon: 'trophy-outline' }
      : { label: 'No ganaste', color: colors.textMuted, icon: 'close-circle-outline' };
  }
  if (item.status === 'unsold') {
    return { label: 'No vendida', color: colors.textMuted, icon: 'close-circle-outline' };
  }
  return { label: '—', color: colors.textMuted, icon: 'help-outline' };
}

export default function MyBidsScreen({ navigation }: Props) {
  const { user } = useAuthStore();
  const nav = useNavigation<any>();
  const [entries, setEntries] = useState<MyBidEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await auctionsApi.myBids();
      setEntries(data);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar tus pujas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={entries}
      keyExtractor={e => e.auctionItemId}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
          tintColor={colors.primary}
        />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Ionicons name="pricetag-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>Aún no has pujado en ninguna subasta</Text>
        </View>
      }
      renderItem={({ item: entry }) => {
        const { item, auction, myTopBid } = entry;
        const status = bidStatusLabel(entry, user?.id ?? '');
        const isNavigable = auction.status === 'live' || auction.status === 'scheduled';
        const thumb = item.imageUrls?.[0];

        return (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={isNavigable ? 0.8 : 1}
            onPress={() => isNavigable && nav.navigate('AuctionDetail', { auctionId: auction.id })}
          >
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="contain" />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Ionicons name="image-outline" size={22} color={colors.textMuted} />
              </View>
            )}

            <View style={styles.info}>
              <Text style={styles.cardName} numberOfLines={1}>{item.cardName}</Text>
              {item.cardSet ? <Text style={styles.cardSet}>{item.cardSet}</Text> : null}
              <Text style={styles.auctionTitle} numberOfLines={1}>{auction.title}</Text>

              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Tu puja</Text>
                <Text style={styles.priceValue}>{formatMXN(myTopBid)}</Text>
                <Text style={styles.priceSep}>·</Text>
                <Text style={styles.priceLabel}>Actual</Text>
                <Text style={[styles.priceValue, item.winnerId === user?.id && styles.winning]}>
                  {formatMXN(item.currentPrice)}
                </Text>
              </View>
            </View>

            <View style={styles.right}>
              <View style={[styles.statusBadge, { borderColor: status.color }]}>
                <Ionicons name={status.icon as any} size={12} color={status.color} />
                <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
              </View>
              {isNavigable && (
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginTop: 8 }} />
              )}
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: 60 },
  emptyText: { color: colors.textMuted, fontSize: font.md, marginTop: spacing.md, textAlign: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  thumb: { width: 52, height: 72, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  thumbEmpty: { justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1, gap: 2 },
  cardName: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  cardSet: { color: colors.textMuted, fontSize: font.sm },
  auctionTitle: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs, flexWrap: 'wrap' },
  priceLabel: { color: colors.textMuted, fontSize: font.xs ?? 11 },
  priceValue: { color: colors.text, fontSize: font.sm, fontWeight: '700' },
  winning: { color: colors.success ?? '#22c55e' },
  priceSep: { color: colors.border, fontSize: font.sm },
  right: { alignItems: 'center' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 3 },
  statusText: { fontSize: font.xs ?? 11, fontWeight: '700' },
});
