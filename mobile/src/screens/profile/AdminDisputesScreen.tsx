import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput, ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { disputesApi } from '../../api/disputes';
import { Dispute, DisputeStatus } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'AdminDisputes'>;

const STATUS_CONFIG: Record<DisputeStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  open:         { label: 'Abierta',    color: '#f59e0b', icon: 'alert-circle-outline' },
  under_review: { label: 'En revisión', color: '#3b82f6', icon: 'eye-outline' },
  resolved:     { label: 'Resuelta',   color: colors.success, icon: 'checkmark-circle-outline' },
  rejected:     { label: 'Rechazada',  color: colors.error, icon: 'close-circle-outline' },
};

const REASON_LABEL: Record<string, string> = {
  not_received:     'No recibido',
  wrong_item:       'Artículo incorrecto',
  damaged:          'Llegó dañado',
  not_as_described: 'No coincide descripción',
  other:            'Otro motivo',
};

type FilterTab = 'all' | DisputeStatus;
const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all',         label: 'Todas' },
  { value: 'open',        label: 'Abiertas' },
  { value: 'under_review', label: 'En revisión' },
  { value: 'resolved',    label: 'Resueltas' },
  { value: 'rejected',    label: 'Rechazadas' },
];

export default function AdminDisputesScreen(_props: Props) {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('all');

  const [resolveModal, setResolveModal] = useState<Dispute | null>(null);
  const [resolveStatus, setResolveStatus] = useState<'resolved' | 'rejected'>('resolved');
  const [resolveNote, setResolveNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await disputesApi.all();
      setDisputes(data);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las disputas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? disputes : disputes.filter(d => d.status === filter);

  const openResolveModal = (dispute: Dispute) => {
    setResolveStatus('resolved');
    setResolveNote('');
    setResolveModal(dispute);
  };

  const handleResolve = async () => {
    if (!resolveModal) return;
    setSubmitting(true);
    try {
      const { data } = await disputesApi.resolve(resolveModal.id, resolveStatus, resolveNote.trim() || undefined);
      setDisputes(prev => prev.map(d => d.id === data.id ? data : d));
      setResolveModal(null);
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'No se pudo resolver la disputa';
      Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const countByStatus = (s: DisputeStatus) => disputes.filter(d => d.status === s).length;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <>
      <View style={styles.container}>
        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsContent}>
          {FILTER_TABS.map(tab => {
            const active = filter === tab.value;
            const count = tab.value === 'all' ? disputes.length : countByStatus(tab.value as DisputeStatus);
            return (
              <TouchableOpacity
                key={tab.value}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setFilter(tab.value)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                {count > 0 && (
                  <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <FlatList
          data={filtered}
          keyExtractor={d => d.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.border} />
              <Text style={styles.emptyText}>Sin disputas en esta categoría</Text>
            </View>
          }
          renderItem={({ item: dispute }) => {
            const sc = STATUS_CONFIG[dispute.status];
            const canResolve = dispute.status === 'open' || dispute.status === 'under_review';

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.statusChip, { backgroundColor: sc.color + '22' }]}>
                    <Ionicons name={sc.icon} size={13} color={sc.color} />
                    <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
                  </View>
                  <Text style={styles.dateText}>
                    {new Date(dispute.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>

                <View style={styles.reasonRow}>
                  <Ionicons name="alert-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.reasonText}>{REASON_LABEL[dispute.reason] ?? dispute.reason}</Text>
                </View>

                <Text style={styles.description} numberOfLines={3}>{dispute.description}</Text>

                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>Orden: {dispute.orderId.slice(0, 8)}…</Text>
                  <Text style={styles.metaText}>Comprador: {dispute.buyerId.slice(0, 8)}…</Text>
                </View>

                {dispute.resolutionNote ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteLabel}>Resolución:</Text>
                    <Text style={styles.noteText}>{dispute.resolutionNote}</Text>
                  </View>
                ) : null}

                {canResolve && (
                  <TouchableOpacity style={styles.resolveBtn} onPress={() => openResolveModal(dispute)}>
                    <Ionicons name="hammer-outline" size={15} color={colors.white} />
                    <Text style={styles.resolveBtnText}>Resolver disputa</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      </View>

      {/* Resolve modal */}
      <Modal visible={!!resolveModal} transparent animationType="fade" onRequestClose={() => setResolveModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Resolver disputa</Text>
            <Text style={styles.modalSubtitle}>
              {resolveModal ? REASON_LABEL[resolveModal.reason] ?? resolveModal.reason : ''}
            </Text>

            {/* Status toggle */}
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, resolveStatus === 'resolved' && styles.toggleBtnActive]}
                onPress={() => setResolveStatus('resolved')}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={resolveStatus === 'resolved' ? colors.white : colors.success} />
                <Text style={[styles.toggleText, resolveStatus === 'resolved' && styles.toggleTextActive]}>Aprobar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, styles.toggleBtnReject, resolveStatus === 'rejected' && styles.toggleBtnRejectActive]}
                onPress={() => setResolveStatus('rejected')}
              >
                <Ionicons name="close-circle-outline" size={16} color={resolveStatus === 'rejected' ? colors.white : colors.error} />
                <Text style={[styles.toggleText, resolveStatus === 'rejected' && styles.toggleTextActive]}>Rechazar</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.noteInput}
              placeholder="Nota de resolución (opcional)"
              placeholderTextColor={colors.textMuted}
              value={resolveNote}
              onChangeText={setResolveNote}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setResolveModal(null)} disabled={submitting}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, resolveStatus === 'rejected' && styles.modalConfirmReject]}
                onPress={handleResolve}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Text style={styles.modalConfirmText}>{resolveStatus === 'resolved' ? 'Aprobar' : 'Rechazar'}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },

  tabsScroll: { borderBottomWidth: 1, borderBottomColor: colors.border, flexGrow: 0 },
  tabsContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  tabTextActive: { color: colors.white },
  tabBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabBadgeText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  tabBadgeTextActive: { color: colors.white },

  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: font.base },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: radius.full,
  },
  statusText: { fontSize: font.xs, fontWeight: '700' },
  dateText: { color: colors.textMuted, fontSize: font.xs },

  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reasonText: { color: colors.text, fontSize: font.sm, fontWeight: '700' },

  description: { color: colors.textMuted, fontSize: font.sm, lineHeight: 18 },

  metaRow: { flexDirection: 'row', gap: spacing.md },
  metaText: { color: colors.textMuted, fontSize: font.xs, fontFamily: 'monospace' },

  noteBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  noteLabel: { color: colors.textMuted, fontSize: font.xs, fontWeight: '700' },
  noteText: { color: colors.text, fontSize: font.sm },

  resolveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.sm,
  },
  resolveBtnText: { color: colors.white, fontWeight: '700', fontSize: font.sm },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.xl,
  },
  modalCard: {
    width: '100%', backgroundColor: colors.surface,
    borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  modalTitle: { color: colors.text, fontSize: font.lg, fontWeight: '800' },
  modalSubtitle: { color: colors.textMuted, fontSize: font.sm, marginTop: -spacing.xs },

  toggleRow: { flexDirection: 'row', gap: spacing.sm },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: spacing.sm, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.success,
  },
  toggleBtnActive: { backgroundColor: colors.success, borderColor: colors.success },
  toggleBtnReject: { borderColor: colors.error },
  toggleBtnRejectActive: { backgroundColor: colors.error, borderColor: colors.error },
  toggleText: { fontSize: font.sm, fontWeight: '700', color: colors.text },
  toggleTextActive: { color: colors.white },

  noteInput: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    color: colors.text, fontSize: font.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    textAlignVertical: 'top', minHeight: 80,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  modalCancel: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  modalCancelText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700' },
  modalConfirm: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.lg, backgroundColor: colors.success,
    minWidth: 90, alignItems: 'center',
  },
  modalConfirmReject: { backgroundColor: colors.error },
  modalConfirmText: { color: colors.white, fontSize: font.sm, fontWeight: '700' },
});
