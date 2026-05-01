import React, { useCallback, useEffect, useState } from 'react';
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
import { ordersApi } from '../../api/orders';
import { Auction, SellerStats } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { formatMXN } from '../../utils/currency';
import { auctionStatusBadge } from '../../utils/auction';
import { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'SellerDashboard'>;

const STATUS_ORDER: Record<Auction['status'], number> = {
  live: 0, scheduled: 1, ended: 2, cancelled: 3,
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

export default function SellerDashboardScreen({ navigation }: Props) {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [auctionsRes, statsRes] = await Promise.all([
        auctionsApi.myAuctions(),
        ordersApi.sellerStats(),
      ]);
      setAuctions([...auctionsRes.data].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]));
      setStats(statsRes.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('CreateAuction')} style={{ marginRight: spacing.sm }}>
          <Ionicons name="add-circle-outline" size={26} color={colors.primaryLight} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const statsHeader = stats ? (
    <View style={styles.statsSection}>
      <View style={styles.statsRow}>
        <StatCard
          label="Ingresos totales"
          value={formatMXN(stats.totalRevenueCents)}
          sub={`+${formatMXN(stats.weekRevenueCents)} esta semana`}
        />
        <StatCard
          label="Cartas vendidas"
          value={String(stats.totalSold)}
          sub={`+${stats.weekSold} esta semana`}
        />
      </View>
      <View style={styles.statsRow}>
        <StatCard
          label="Envíos pendientes"
          value={String(stats.pendingShipments)}
        />
        {stats.bestCard ? (
          <StatCard
            label="Mejor venta"
            value={formatMXN(stats.bestCard.priceCents)}
            sub={stats.bestCard.cardName}
          />
        ) : (
          <StatCard label="Mejor venta" value="—" />
        )}
      </View>
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      <FlatList
        data={auctions}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={statsHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="albums-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No tienes subastas aún</Text>
            <TouchableOpacity style={styles.createBtn} onPress={() => navigation.navigate('CreateAuction')}>
              <Text style={styles.createBtnText}>Crear primera subasta</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const badge = auctionStatusBadge(item.status);
          const itemCount = item.items?.length ?? 0;
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('ManageAuction', { auctionId: item.id })}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  {item.status === 'live' && <View style={styles.liveDot} />}
                  <Text style={styles.badgeText}>{badge.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <View style={styles.cardMeta}>
                <Text style={styles.metaText}>
                  <Ionicons name="layers-outline" size={12} /> {itemCount} {itemCount === 1 ? 'carta' : 'cartas'}
                </Text>
                {item.scheduledAt && item.status === 'scheduled' && (
                  <Text style={styles.metaText}>
                    <Ionicons name="time-outline" size={12} />{' '}
                    {new Date(item.scheduledAt).toLocaleString('es-MX', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: spacing.xxl },
  list: { padding: spacing.md, gap: spacing.md },
  statsSection: { gap: spacing.sm, marginBottom: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  statValue: { color: colors.primaryLight, fontSize: font.xl, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  statSub: { color: colors.success, fontSize: font.xs, marginTop: 4, fontWeight: '600' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  badgeText: { color: colors.white, fontSize: font.sm, fontWeight: '700' },
  cardTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700', marginBottom: spacing.xs },
  cardMeta: { flexDirection: 'row', gap: spacing.md },
  metaText: { color: colors.textMuted, fontSize: font.sm },
  emptyText: { color: colors.textMuted, fontSize: font.md, marginTop: spacing.md, marginBottom: spacing.lg },
  createBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md },
  createBtnText: { color: colors.white, fontWeight: '700', fontSize: font.base },
});
