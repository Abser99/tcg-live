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
import { Auction } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { auctionStatusBadge } from '../../utils/auction';
import { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'SellerDashboard'>;

const STATUS_ORDER: Record<Auction['status'], number> = {
  live: 0, scheduled: 1, ended: 2, cancelled: 3,
};

export default function SellerDashboardScreen({ navigation }: Props) {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await auctionsApi.myAuctions();
      setAuctions([...data].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]));
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
