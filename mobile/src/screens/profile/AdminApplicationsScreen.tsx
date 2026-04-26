import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sellerApplicationsApi } from '../../api/seller-applications';
import { SellerApplication } from '../../types';
import { colors, spacing, radius, font } from '../../theme';

export default function AdminApplicationsScreen() {
  const [applications, setApplications] = useState<SellerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await sellerApplicationsApi.listAll('pending');
      setApplications(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleReview = (app: SellerApplication, decision: 'approved' | 'rejected') => {
    const action = decision === 'approved' ? 'aprobar' : 'rechazar';
    Alert.alert(
      `¿${decision === 'approved' ? 'Aprobar' : 'Rechazar'} a ${app.fullName}?`,
      decision === 'rejected' ? 'Puedes añadir una nota (opcional)' : undefined,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: action.charAt(0).toUpperCase() + action.slice(1),
          style: decision === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await sellerApplicationsApi.review(app.id, decision);
              setApplications((prev) => prev.filter((a) => a.id !== app.id));
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.message ?? 'No se pudo procesar');
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={applications}
      keyExtractor={(a) => a.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
          tintColor={colors.primary}
        />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={48} color={colors.success} />
          <Text style={styles.emptyText}>No hay solicitudes pendientes</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.name}>{item.fullName}</Text>
            <Text style={styles.state}>{item.state}</Text>
          </View>
          <Text style={styles.description}>{item.description}</Text>
          <Text style={styles.date}>
            {new Date(item.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={() => handleReview(item, 'approved')}
            >
              <Ionicons name="checkmark" size={16} color={colors.white} />
              <Text style={styles.actionText}>Aprobar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => handleReview(item, 'rejected')}
            >
              <Ionicons name="close" size={16} color={colors.white} />
              <Text style={styles.actionText}>Rechazar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.md, gap: spacing.md },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: spacing.xxl },
  emptyText: { color: colors.textMuted, fontSize: font.md, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  name: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  state: { color: colors.accent, fontSize: font.sm },
  description: { color: colors.textMuted, fontSize: font.md, marginBottom: spacing.sm, lineHeight: 20 },
  date: { color: colors.textMuted, fontSize: font.sm, marginBottom: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  approveBtn: { backgroundColor: colors.success },
  rejectBtn: { backgroundColor: colors.error },
  actionText: { color: colors.white, fontWeight: '700', fontSize: font.md },
});
