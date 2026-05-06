import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { usersApi } from '../../api/users';
import { auctionsApi } from '../../api/auctions';
import { followsApi } from '../../api/follows';
import { useAuthStore } from '../../store/auth.store';
import { Auction, User } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { auctionStatusBadge } from '../../utils/auction';
import { AppStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'SellerProfile'>;

export default function SellerProfileScreen({ route, navigation }: Props) {
  const { sellerId } = route.params;
  const currentUserId = useAuthStore(s => s.user?.id);
  const [seller, setSeller]     = useState<Partial<User> | null>(null);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [following, setFollowing]   = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [profileRes, auctionsRes, followRes] = await Promise.all([
        usersApi.getProfile(sellerId),
        auctionsApi.listBySeller(sellerId),
        followsApi.status(sellerId).catch(() => ({ data: { following: false } })),
      ]);
      setSeller(profileRes.data);
      setAuctions(auctionsRes.data);
      setFollowing(followRes.data.following);
    } catch {
      Alert.alert('Error', 'No se pudo cargar el perfil');
      if (navigation.canGoBack()) navigation.goBack();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sellerId]);

  const toggleFollow = async () => {
    if (followBusy) return;
    setFollowBusy(true);
    try {
      if (following) {
        await followsApi.unfollow(sellerId);
        setFollowing(false);
      } else {
        await followsApi.follow(sellerId);
        setFollowing(true);
      }
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el seguimiento');
    } finally {
      setFollowBusy(false);
    }
  };

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const live = auctions.filter(a => a.status === 'live');
  const upcoming = auctions.filter(a => a.status === 'scheduled');
  const ended = auctions.filter(a => a.status === 'ended');
  const itemsSold = ended.reduce(
    (sum, a) => sum + (a.items?.filter(i => i.status === 'sold').length ?? 0), 0,
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
    >
      {/* Avatar + info */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{seller?.username?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={styles.usernameRow}>
          <Text style={styles.username}>@{seller?.username}</Text>
          {seller?.isVerified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={18} color="#3b82f6" />
              <Text style={styles.verifiedText}>Verificado</Text>
            </View>
          )}
        </View>
        {seller?.displayName ? <Text style={styles.displayName}>{seller.displayName}</Text> : null}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            {seller?.averageRating != null ? (
              <View style={styles.ratingRow}>
                <Text style={styles.statValue}>{seller.averageRating.toFixed(1)}</Text>
                <Ionicons name="star" size={14} color={colors.warning} style={{ marginTop: 4 }} />
              </View>
            ) : (
              <Text style={styles.statValue}>{seller?.reputationScore ?? 0}</Text>
            )}
            <Text style={styles.statLabel}>
              {seller?.totalRatings ? `${seller.totalRatings} calificaciones` : 'Sin calificaciones'}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{itemsSold}</Text>
            <Text style={styles.statLabel}>Cartas vendidas</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{live.length + upcoming.length}</Text>
            <Text style={styles.statLabel}>Activas</Text>
          </View>
        </View>
        {currentUserId !== sellerId && (
          <TouchableOpacity
            style={[styles.followBtn, following && styles.followBtnActive]}
            onPress={toggleFollow}
            disabled={followBusy}
          >
            {followBusy ? (
              <ActivityIndicator size="small" color={following ? colors.primary : '#fff'} />
            ) : (
              <>
                <Ionicons
                  name={following ? 'notifications' : 'notifications-outline'}
                  size={16}
                  color={following ? colors.primary : '#fff'}
                />
                <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                  {following ? 'Siguiendo' : 'Seguir'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

      </View>

      {/* Live auctions */}
      {live.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔴 EN VIVO</Text>
          {live.map(a => (
            <AuctionRow key={a.id} auction={a} onPress={() => navigation.navigate('AuctionDetail', { auctionId: a.id })} />
          ))}
        </View>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRÓXIMAS</Text>
          {upcoming.map(a => (
            <AuctionRow key={a.id} auction={a} onPress={() => navigation.navigate('AuctionDetail', { auctionId: a.id })} />
          ))}
        </View>
      )}

      {/* Recent ended */}
      {ended.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SUBASTAS ANTERIORES</Text>
          {ended.slice(0, 5).map(a => (
            <AuctionRow key={a.id} auction={a} onPress={() => navigation.navigate('AuctionDetail', { auctionId: a.id })} />
          ))}
        </View>
      )}

      {live.length === 0 && upcoming.length === 0 && ended.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="storefront-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>Este vendedor no tiene subastas aún</Text>
        </View>
      )}
    </ScrollView>
  );
}

function AuctionRow({ auction, onPress }: { auction: Auction; onPress: () => void }) {
  const badge = auctionStatusBadge(auction.status);
  return (
    <TouchableOpacity style={styles.auctionRow} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.rowBadge, { backgroundColor: badge.bg }]}>
        <Text style={styles.rowBadgeText}>{badge.label}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.auctionTitle} numberOfLines={1}>{auction.title}</Text>
        <Text style={styles.auctionMeta}>{auction.items?.length ?? 0} cartas</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', padding: spacing.xl, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'center' },
  username: { color: colors.text, fontSize: font.xl, fontWeight: '700' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#eff6ff', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, borderWidth: 1, borderColor: '#bfdbfe' },
  verifiedText: { color: '#3b82f6', fontSize: font.sm, fontWeight: '700' },
  displayName: { color: colors.textMuted, fontSize: font.md, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg, alignItems: 'center' },
  stat: { alignItems: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statValue: { color: colors.text, fontSize: font.xl, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: font.xs ?? 11, marginTop: 2, textAlign: 'center' },
  statDivider: { width: 1, height: 32, backgroundColor: colors.border },
  followBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  followBtnActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
  followBtnText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
  followBtnTextActive: { color: colors.primary },
  section: { padding: spacing.md, gap: spacing.xs },
  sectionTitle: { color: colors.textMuted, fontSize: font.sm, fontWeight: '800', letterSpacing: 1, marginBottom: spacing.xs },
  auctionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  rowBadge: { paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.sm },
  rowBadgeText: { color: '#fff', fontSize: font.xs ?? 11, fontWeight: '700' },
  auctionTitle: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  auctionMeta: { color: colors.textMuted, fontSize: font.sm },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: font.md },
});
