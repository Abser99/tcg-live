import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, RefreshControl, Alert, Modal, TextInput, Linking,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ordersApi } from '../../api/orders';
import { useNavigation } from '@react-navigation/native';
import { Order } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { formatMXN } from '../../utils/currency';
import { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'MyOrders'>;

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pendiente', color: colors.textMuted },
  confirmed: { label: 'Confirmado', color: colors.accent },
  shipped:   { label: 'Enviado', color: colors.primary },
  delivered: { label: 'Entregado', color: colors.success ?? '#22c55e' },
};

const SHIPPING_OPTIONS: { value: 'combined' | 'individual'; label: string; desc: string }[] = [
  { value: 'combined',   label: 'Un solo envío',     desc: 'Todas tus cartas en un paquete' },
  { value: 'individual', label: 'Envíos separados',  desc: 'Una carta por paquete' },
];

const STARS = [1, 2, 3, 4, 5];

export default function MyOrdersScreen({ navigation }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ratingOrder, setRatingOrder] = useState<Order | null>(null);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingNote, setRatingNote] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await ordersApi.myOrders();
      setOrders(data);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las compras');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleConfirmReceived = async (order: Order) => {
    Alert.alert('Confirmar recibido', '¿Confirmás que recibiste el paquete?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, lo recibí', onPress: async () => {
          try {
            const { data } = await ordersApi.confirmReceived(order.id);
            setOrders(prev => prev.map(o => o.id === data.id ? data : o));
            setRatingOrder(data);
            setSelectedRating(0);
            setRatingNote('');
          } catch {
            Alert.alert('Error', 'No se pudo confirmar la recepción');
          }
        },
      },
    ]);
  };

  const handleSubmitRating = async () => {
    if (!ratingOrder || selectedRating === 0) {
      Alert.alert('Elige una calificación');
      return;
    }
    setSubmittingRating(true);
    try {
      const { data } = await ordersApi.rate(ratingOrder.id, selectedRating, ratingNote || undefined);
      setOrders(prev => prev.map(o => o.id === data.id ? data : o));
      setRatingOrder(null);
    } catch {
      Alert.alert('Error', 'No se pudo enviar la calificación');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handlePay = async (order: Order) => {
    setPayingOrderId(order.id);
    try {
      const { data } = await ordersApi.checkout(order.id);
      setOrders(prev => prev.map(o => o.id === data.order.id ? data.order : o));
      if (data.order.paymentStatus === 'paid') {
        Alert.alert('¡Pago completado!', 'Tu pago fue registrado. El vendedor preparará tu pedido.');
      } else {
        await Linking.openURL(data.sandboxInitPoint);
      }
    } catch {
      Alert.alert('Error', 'No se pudo iniciar el pago. Intenta de nuevo.');
    } finally {
      setPayingOrderId(null);
    }
  };

  const handleShippingChoice = async (order: Order, choice: 'combined' | 'individual') => {
    try {
      const { data } = await ordersApi.setShippingChoice(order.id, choice);
      setOrders(prev => prev.map(o => o.id === data.id ? data : o));
    } catch {
      Alert.alert('Error', 'No se pudo guardar la preferencia');
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <>
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={orders}
      keyExtractor={o => o.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Ionicons name="bag-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>No tienes compras aún</Text>
        </View>
      }
      renderItem={({ item: order }) => {
        const st = STATUS_LABEL[order.status] ?? STATUS_LABEL.pending;
        const total = order.items.reduce((s, i) => s + i.finalPrice, 0);
        return (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardDate}>
                {new Date(order.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
              <View style={styles.badgesRow}>
                {order.paymentStatus === 'paid' && (
                  <View style={styles.paidBadge}>
                    <Ionicons name="checkmark-circle" size={12} color="#fff" />
                    <Text style={styles.paidBadgeText}>Pagado</Text>
                  </View>
                )}
                <Text style={[styles.statusBadge, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>

            {order.items.map(item => (
              <View key={item.id} style={styles.itemRow}>
                {item.imageUrls?.[0] ? (
                  <Image source={{ uri: item.imageUrls[0] }} style={styles.thumb} resizeMode="contain" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Ionicons name="image-outline" size={18} color={colors.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.cardName}</Text>
                  {item.cardSet && <Text style={styles.itemMeta}>{item.cardSet}</Text>}
                </View>
                <Text style={styles.itemPrice}>{formatMXN(item.finalPrice)}</Text>
              </View>
            ))}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total ({order.items.length} {order.items.length === 1 ? 'carta' : 'cartas'})</Text>
              <Text style={styles.totalAmount}>{formatMXN(total)}</Text>
            </View>

            {order.shippingCost ? (
              <View style={styles.shippingCostRow}>
                <Text style={styles.shippingCostLabel}>{order.carrier ?? 'Envío'}</Text>
                <Text style={styles.shippingCostAmount}>{formatMXN(order.shippingCost)}</Text>
              </View>
            ) : null}

            {order.trackingNumber ? (
              <View style={styles.trackingRow}>
                <Ionicons name="bus-outline" size={14} color={colors.primary} />
                <Text style={styles.trackingText}>Guía: {order.trackingNumber}</Text>
              </View>
            ) : null}

            {(!order.paymentStatus || order.paymentStatus === 'unpaid') && (
              <TouchableOpacity
                style={styles.payBtn}
                onPress={() => handlePay(order)}
                disabled={payingOrderId === order.id}
              >
                {payingOrderId === order.id
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <>
                      <Ionicons name="card-outline" size={16} color="#fff" />
                      <Text style={styles.payBtnText}>Pagar ahora</Text>
                    </>
                }
              </TouchableOpacity>
            )}

            {order.status === 'shipped' && (
              <TouchableOpacity style={styles.receivedBtn} onPress={() => handleConfirmReceived(order)}>
                <Ionicons name="checkmark-done-outline" size={16} color="#fff" />
                <Text style={styles.receivedBtnText}>Confirmar recibido</Text>
              </TouchableOpacity>
            )}

            {order.status === 'delivered' && !order.sellerRating && (
              <TouchableOpacity style={styles.rateBtn} onPress={() => { setRatingOrder(order); setSelectedRating(0); setRatingNote(''); }}>
                <Ionicons name="star-outline" size={16} color={colors.warning} />
                <Text style={styles.rateBtnText}>Calificar vendedor</Text>
              </TouchableOpacity>
            )}

            {order.sellerRating ? (
              <View style={styles.ratedRow}>
                <Text style={styles.ratedText}>Tu calificación: {'⭐'.repeat(order.sellerRating)}</Text>
              </View>
            ) : null}

            {order.status === 'pending' && !order.shippingChoice && (
              <View style={styles.shippingSection}>
                <Text style={styles.shippingTitle}>¿Cómo quieres tu envío?</Text>
                {SHIPPING_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={styles.shippingOption}
                    onPress={() => handleShippingChoice(order, opt.value)}
                  >
                    <View style={styles.shippingOptionInner}>
                      <Text style={styles.shippingOptLabel}>{opt.label}</Text>
                      <Text style={styles.shippingOptDesc}>{opt.desc}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {order.shippingChoice && (
              <View style={styles.shippingChosen}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success ?? '#22c55e'} />
                <Text style={styles.shippingChosenText}>
                  {order.shippingChoice === 'combined' ? 'Un solo envío' : 'Envíos separados'}
                </Text>
              </View>
            )}
          </View>
        );
      }}
    />

    {/* Rating modal */}
    <Modal visible={!!ratingOrder} transparent animationType="slide" onRequestClose={() => setRatingOrder(null)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Calificar al vendedor</Text>
          <Text style={styles.modalHint}>¿Cómo fue tu experiencia?</Text>
          <View style={styles.starsRow}>
            {STARS.map(s => (
              <TouchableOpacity key={s} onPress={() => setSelectedRating(s)} style={styles.starBtn}>
                <Text style={styles.starEmoji}>{s <= selectedRating ? '⭐' : '☆'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.ratingInput}
            value={ratingNote}
            onChangeText={setRatingNote}
            placeholder="Comentario opcional..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={300}
          />
          <TouchableOpacity style={styles.submitRatingBtn} onPress={handleSubmitRating} disabled={submittingRating || selectedRating === 0}>
            {submittingRating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitRatingText}>Enviar calificación</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={() => setRatingOrder(null)}>
            <Text style={styles.skipText}>Ahora no</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: 60 },
  emptyText: { color: colors.textMuted, fontSize: font.md, marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cardDate: { color: colors.textMuted, fontSize: font.sm },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusBadge: { fontSize: font.sm, fontWeight: '700' },
  paidBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#22c55e', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  paidBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.sm },
  payBtnText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  thumb: { width: 48, height: 67, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  thumbEmpty: { justifyContent: 'center', alignItems: 'center' },
  itemName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  itemMeta: { color: colors.textMuted, fontSize: font.sm },
  itemPrice: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.sm },
  totalLabel: { color: colors.textMuted, fontSize: font.md },
  totalAmount: { color: colors.primaryLight, fontSize: font.lg, fontWeight: '800' },
  shippingSection: { marginTop: spacing.md, gap: spacing.xs },
  shippingTitle: { color: colors.text, fontSize: font.sm, fontWeight: '700', marginBottom: spacing.xs },
  shippingOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.border },
  shippingOptionInner: { flex: 1 },
  shippingOptLabel: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  shippingOptDesc: { color: colors.textMuted, fontSize: font.sm },
  shippingChosen: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  shippingChosenText: { color: colors.textMuted, fontSize: font.sm },
  shippingCostRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  shippingCostLabel: { color: colors.textMuted, fontSize: font.sm },
  shippingCostAmount: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  trackingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  trackingText: { color: colors.primary, fontSize: font.sm, fontWeight: '600' },
  receivedBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.sm, backgroundColor: colors.success ?? '#22c55e', borderRadius: radius.md, padding: spacing.sm },
  receivedBtnText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
  rateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.md, padding: spacing.sm },
  rateBtnText: { color: colors.warning, fontWeight: '700', fontSize: font.sm },
  ratedRow: { marginTop: spacing.xs },
  ratedText: { color: colors.textMuted, fontSize: font.sm },
  // rating modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
  modalTitle: { color: colors.text, fontSize: font.xl, fontWeight: '800', textAlign: 'center' },
  modalHint: { color: colors.textMuted, fontSize: font.md, textAlign: 'center' },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  starBtn: { padding: spacing.xs },
  starEmoji: { fontSize: 36 },
  ratingInput: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: font.md, minHeight: 80, textAlignVertical: 'top' },
  submitRatingBtn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  submitRatingText: { color: '#fff', fontWeight: '700', fontSize: font.md },
  skipBtn: { alignItems: 'center', padding: spacing.sm },
  skipText: { color: colors.textMuted, fontSize: font.md },
});
