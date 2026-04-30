import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, Alert, Image, TouchableOpacity, Modal, ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ordersApi, shippingApi } from '../../api/orders';
import { Order, OrderStatus, ShippingQuote } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { formatMXN } from '../../utils/currency';
import { ProfileStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/auth.store';

type Props = NativeStackScreenProps<ProfileStackParamList, 'AuctionOrders'>;

const BUYER_LABEL = 'comprador';

const STATUS_LABEL: Record<OrderStatus, { label: string; color: string }> = {
  pending:   { label: 'Pendiente',  color: colors.textMuted },
  confirmed: { label: 'Confirmado', color: colors.accent },
  shipped:   { label: 'Enviado',    color: colors.primary },
  delivered: { label: 'Entregado',  color: colors.success ?? '#22c55e' },
};

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending:   'confirmed',
  confirmed: 'shipped',
};

export default function AuctionOrdersScreen({ route, navigation }: Props) {
  const { auctionId } = route.params;
  const user = useAuthStore(s => s.user);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // shipping quote modal state
  const [quoteOrder, setQuoteOrder]   = useState<Order | null>(null);
  const [quotes, setQuotes]           = useState<ShippingQuote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await ordersApi.auctionOrders(auctionId);
      setOrders(data);
    } catch {
      Alert.alert('Error', 'No se pudo cargar la lista');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [auctionId]);

  useEffect(() => { load(); }, [load]);

  const handleStatusUpdate = async (order: Order, status: OrderStatus) => {
    try {
      const { data } = await ordersApi.updateStatus(order.id, status);
      setOrders(prev => prev.map(o => o.id === data.id ? data : o));
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el estado');
    }
  };

  const openShippingQuote = async (order: Order) => {
    if (!user?.zipCode) {
      Alert.alert('Falta tu CP', 'Agrega tu código postal en tu perfil para cotizar envíos.');
      return;
    }
    setQuoteOrder(order);
    setQuotesLoading(true);
    setQuotes([]);
    try {
      if (!order.buyerZip) {
        Alert.alert('Sin CP del comprador', 'El comprador no ha registrado su dirección aún.');
        return;
      }
      const weightKg = Math.max(0.1, order.items.length * 0.05);
      const { data } = await shippingApi.getQuotes({
        originZip:      user.zipCode,
        destinationZip: order.buyerZip,
        weightKg,
        items: order.items.length,
      });
      setQuotes(data);
    } catch {
      Alert.alert('Error', 'No se pudieron obtener cotizaciones');
    } finally {
      setQuotesLoading(false);
    }
  };

  const handleGenerateLabel = async (quote: ShippingQuote) => {
    if (!quoteOrder || !user?.zipCode) return;
    try {
      const weightKg = Math.max(0.1, quoteOrder.items.length * 0.05);
      const { data } = await ordersApi.generateLabel(quoteOrder.id, {
        carrierId:      quote.carrierId,
        originZip:      user.zipCode,
        destinationZip: quoteOrder.buyerZip!,
        weightKg,
      });
      setOrders(prev => prev.map(o => o.id === data.id ? data : o));
      setQuoteOrder(null);
      Alert.alert('¡Guía generada!', `Número de guía: ${data.trackingNumber}`);
    } catch {
      Alert.alert('Error', 'No se pudo generar la guía');
    }
  };

  const total = orders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.finalPrice, 0), 0);

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
        ListHeaderComponent={
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>{orders.length} compradores · {formatMXN(total)} total</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>Sin ventas aún</Text>
          </View>
        }
        renderItem={({ item: order, index }) => {
          const st = STATUS_LABEL[order.status];
          const nextStatus = NEXT_STATUS[order.status];
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.buyerNum}>Comprador #{index + 1}</Text>
                <View style={styles.chipRow}>
                  {order.paymentStatus === 'paid'
                    ? <View style={styles.paidChip}><Text style={styles.paidChipText}>💳 Pagado</Text></View>
                    : <View style={styles.unpaidChip}><Text style={styles.unpaidChipText}>⏳ Sin pagar</Text></View>
                  }
                  <Text style={[styles.statusChip, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>

              <View style={styles.shippingRow}>
                <Text style={styles.shippingMeta}>
                  {order.shippingChoice === 'combined' ? '📦 Un envío'
                    : order.shippingChoice === 'individual' ? '📦 Separado'
                    : '⏳ Sin decidir'}
                </Text>
                {order.trackingNumber ? (
                  <Text style={styles.tracking}>🚚 {order.trackingNumber}</Text>
                ) : null}
              </View>

              {order.items.map(item => (
                <View key={item.id} style={styles.itemRow}>
                  {item.imageUrls?.[0] ? (
                    <Image source={{ uri: item.imageUrls[0] }} style={styles.thumb} resizeMode="contain" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Ionicons name="layers-outline" size={16} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.cardName}</Text>
                    {item.cardSet && <Text style={styles.itemMeta}>{item.cardSet}</Text>}
                  </View>
                  <Text style={styles.itemPrice}>{formatMXN(item.finalPrice)}</Text>
                </View>
              ))}

              <Text style={styles.orderTotal}>
                Subtotal: {formatMXN(order.items.reduce((s, i) => s + i.finalPrice, 0))}
                {order.shippingCost ? ` + ${formatMXN(order.shippingCost)} envío` : ''}
              </Text>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.btnMsg}
                  onPress={() => navigation.navigate('OrderMessages', {
                    orderId: order.id,
                    otherUsername: BUYER_LABEL,
                  })}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.accent} />
                  <Text style={styles.btnMsgText}>Mensajes</Text>
                </TouchableOpacity>
                {!order.trackingNumber && order.shippingChoice && (
                  <TouchableOpacity style={styles.btnSecondary} onPress={() => openShippingQuote(order)}>
                    <Ionicons name="barcode-outline" size={14} color={colors.primary} />
                    <Text style={styles.btnSecondaryText}>Generar guía</Text>
                  </TouchableOpacity>
                )}
                {nextStatus && (
                  <TouchableOpacity
                    style={[styles.btnPrimary, nextStatus === 'confirmed' && order.paymentStatus !== 'paid' && styles.btnDisabled]}
                    onPress={() => {
                      if (nextStatus === 'confirmed' && order.paymentStatus !== 'paid') {
                        Alert.alert('Pago pendiente', 'El comprador aún no ha realizado el pago.');
                        return;
                      }
                      handleStatusUpdate(order, nextStatus);
                    }}
                  >
                    <Text style={styles.btnPrimaryText}>
                      {nextStatus === 'confirmed' ? 'Confirmar' : 'Marcar enviado'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Shipping quote modal */}
      <Modal visible={!!quoteOrder} transparent animationType="slide" onRequestClose={() => setQuoteOrder(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cotizar envío</Text>
              <TouchableOpacity onPress={() => setQuoteOrder(null)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            {quotesLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: spacing.xl }} />
            ) : (
              <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}>
                {quotes.map(q => (
                  <TouchableOpacity key={q.carrierId} style={styles.quoteCard} onPress={() => handleGenerateLabel(q)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.quoteName}>{q.carrier} — {q.service}</Text>
                      <Text style={styles.quoteDays}>{q.estimatedDays} día{q.estimatedDays !== 1 ? 's' : ''} hábil{q.estimatedDays !== 1 ? 'es' : ''}</Text>
                    </View>
                    <Text style={styles.quotePrice}>{formatMXN(q.priceCents)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
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
  summary: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  summaryTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  buyerNum: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusChip: { fontSize: font.sm, fontWeight: '700' },
  paidChip: { backgroundColor: '#14532d', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  paidChipText: { color: '#86efac', fontSize: font.xs, fontWeight: '700' },
  unpaidChip: { backgroundColor: '#431407', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  unpaidChipText: { color: '#fdba74', fontSize: font.xs, fontWeight: '700' },
  btnDisabled: { backgroundColor: colors.textMuted },
  shippingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shippingMeta: { color: colors.textMuted, fontSize: font.sm },
  tracking: { color: colors.primary, fontSize: font.sm, fontWeight: '600' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  thumb: { width: 40, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  thumbEmpty: { justifyContent: 'center', alignItems: 'center' },
  itemName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  itemMeta: { color: colors.textMuted, fontSize: font.sm },
  itemPrice: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  orderTotal: { color: colors.primaryLight, fontSize: font.md, fontWeight: '700', textAlign: 'right', marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, justifyContent: 'flex-end', flexWrap: 'wrap' },
  btnMsg: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.accent, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  btnMsgText: { color: colors.accent, fontWeight: '600', fontSize: font.sm },
  btnPrimary: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
  btnSecondary: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  btnSecondaryText: { color: colors.primary, fontWeight: '600', fontSize: font.sm },
  // modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  quoteCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  quoteName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  quoteDays: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  quotePrice: { color: colors.primaryLight, fontSize: font.lg, fontWeight: '800' },
});
