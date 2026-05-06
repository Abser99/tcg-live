import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { watchlistApi } from '../../api/watchlist';
import { Auction } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Watchlist'>;

const GAME_EMOJI: Record<string, string> = {
  pokemon: '⚡', mtg: '🔮', yugioh: '👁', onepiece: '⚓', lorcana: '✨', other: '🎮',
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Programada', color: colors.textMuted },
  live:       { label: 'En vivo',    color: colors.error },
  ended:      { label: 'Terminada',  color: colors.textMuted },
  cancelled:  { label: 'Cancelada',  color: colors.textMuted },
};

export default function WatchlistScreen({}: Props) {
  const rootNav = useNavigation<any>();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await watchlistApi.mine();
      setAuctions(data);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar tus guardados');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRemove = async (auction: Auction) => {
    Alert.alert(
      'Quitar de guardados',
      `¿Quitar "${auction.title}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar', style: 'destructive',
          onPress: async () => {
            setRemoving(auction.id);
            try {
              await watchlistApi.remove(auction.id);
              setAuctions(prev => prev.filter(a => a.id !== auction.id));
            } catch {
              Alert.alert('Error', 'No se pudo quitar');
            } finally {
              setRemoving(null);
            }
          },
        },
      ],
    );
  };

  const handlePress = (auction: Auction) => {
    rootNav.navigate('Auctions', {
      screen: 'AuctionDetail',
      params: { auctionId: auction.id },
    });
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  if (!auctions.length) {
    return (
      <View style={styles.center}>
        <Ionicons name="bookmark-outline" size={48} color={colors.border} />
        <Text style={styles.emptyTitle}>Sin subastas guardadas</Text>
        <Text style={styles.emptyDesc}>Guarda subastas desde la pantalla de detalle para seguirlas aquí.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={auctions}
      keyExtractor={a => a.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
      renderItem={({ item: auction }) => {
        const sc = STATUS_CONFIG[auction.status] ?? STATUS_CONFIG.ended;
        const emoji = GAME_EMOJI[auction.game] ?? '🎮';
        const isLive = auction.status === 'live';

        return (
          <TouchableOpacity style={styles.card} onPress={() => handlePress(auction)} activeOpacity={0.8}>
            <View style={styles.cardLeft}>
              <View style={styles.gameEmoji}>
                <Text style={styles.emojiText}>{emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={2}>{auction.title}</Text>
                <Text style={styles.seller}>@{auction.seller?.username ?? '—'}</Text>
                {auction.scheduledAt && auction.status === 'scheduled' ? (
                  <Text style={styles.date}>
                    {new Date(auction.scheduledAt).toLocaleDateString('es-MX', {
                      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.cardRight}>
              <View style={[styles.statusChip, { backgroundColor: sc.color + '22' }, isLive && styles.liveChip]}>
                {isLive && <View style={styles.liveDot} />}
                <Text style={[styles.statusText, { color: sc.color }, isLive && { color: colors.error }]}>{sc.label}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemove(auction)}
                disabled={removing === auction.id}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {removing === auction.id
                  ? <ActivityIndicator size="small" color={colors.textMuted} />
                  : <Ionicons name="bookmark" size={18} color={colors.warning} />
                }
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm, padding: spacing.xl, backgroundColor: colors.bg },
  emptyTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700', marginTop: spacing.md },
  emptyDesc: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center', lineHeight: 20 },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, flexDirection: 'row',
    alignItems: 'flex-start', gap: spacing.md,
  },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardRight: { alignItems: 'flex-end', gap: spacing.sm },

  gameEmoji: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiText: { fontSize: 20 },

  title: { color: colors.text, fontSize: font.md, fontWeight: '700', lineHeight: 20 },
  seller: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  date: { color: colors.accent, fontSize: font.xs, marginTop: 4, fontWeight: '600' },

  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: radius.full,
  },
  liveChip: { backgroundColor: colors.error + '22' },
  liveDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.error,
  },
  statusText: { fontSize: font.xs, fontWeight: '700' },

  removeBtn: {
    padding: 4,
  },
});
