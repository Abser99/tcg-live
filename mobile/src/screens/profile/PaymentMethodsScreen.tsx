import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, RefreshControl, Modal, ScrollView,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { paymentMethodsApi } from '../../api/paymentMethods';
import { PaymentMethod, PaymentMethodType } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'PaymentMethods'>;

const TYPE_OPTIONS: { type: PaymentMethodType; label: string; icon: string; desc: string }[] = [
  { type: 'card',  label: 'Tarjeta',          icon: 'card-outline',          desc: 'Crédito o débito' },
  { type: 'oxxo',  label: 'OXXO',             icon: 'storefront-outline',    desc: 'Pago en tienda' },
  { type: 'spei',  label: 'Transferencia SPEI', icon: 'swap-horizontal-outline', desc: 'Banco a banco' },
];

const BRAND_ICON: Record<string, string> = {
  visa: '💳', mastercard: '💳', amex: '💳', other: '💳',
};

function formatCardNumber(text: string) {
  return text.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

export default function PaymentMethodsScreen({ navigation }: Props) {
  const [methods, setMethods]       = useState<PaymentMethod[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd]       = useState(false);
  const [selectedType, setSelectedType] = useState<PaymentMethodType | null>(null);

  // Card form state
  const [cardNumber, setCardNumber]     = useState('');
  const [expiry, setExpiry]             = useState('');
  const [cvv, setCvv]                   = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [saving, setSaving]             = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await paymentMethodsApi.list();
      setMethods(data);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las formas de pago');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setSelectedType(null);
    setCardNumber('');
    setExpiry('');
    setCvv('');
    setCardholderName('');
  };

  const handleAdd = async () => {
    if (!selectedType) return;

    if (selectedType === 'card') {
      const num = cardNumber.replace(/\s/g, '');
      if (num.length < 13) { Alert.alert('Error', 'Número de tarjeta inválido'); return; }
      if (!/^\d{2}\/\d{2}$/.test(expiry)) { Alert.alert('Error', 'Expiración inválida (MM/YY)'); return; }
      if (!/^\d{3,4}$/.test(cvv)) { Alert.alert('Error', 'CVV inválido — debe tener 3 o 4 dígitos'); return; }

      // Card tokenization requires Stripe/Conekta integration which is not yet active.
      Alert.alert(
        'Próximamente',
        'El cobro con tarjeta estará disponible pronto.\n\nIntegración con Stripe/Conekta pendiente.\n\nPor ahora puedes registrar OXXO o SPEI.',
        [{ text: 'Entendido' }],
      );
      return;
    }

    setSaving(true);
    try {
      const { data } = await paymentMethodsApi.add({ type: selectedType });
      setMethods(prev => [...prev, data]);
      setShowAdd(false);
      resetForm();
    } catch {
      Alert.alert('Error', 'No se pudo agregar la forma de pago');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const { data } = await paymentMethodsApi.setDefault(id);
      setMethods(prev => prev.map(m => ({ ...m, isDefault: m.id === data.id })));
    } catch {
      Alert.alert('Error', 'No se pudo actualizar');
    }
  };

  const handleRemove = (id: string) => {
    Alert.alert('Eliminar', '¿Eliminar esta forma de pago?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            await paymentMethodsApi.remove(id);
            setMethods(prev => prev.filter(m => m.id !== id));
          } catch {
            Alert.alert('Error', 'No se pudo eliminar');
          }
        },
      },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        data={methods}
        keyExtractor={m => m.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="card-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>Sin formas de pago</Text>
            <Text style={styles.emptyHint}>Agrega una para poder ofertar en subastas en vivo</Text>
          </View>
        }
        ListFooterComponent={
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={styles.addBtnText}>Agregar forma de pago</Text>
          </TouchableOpacity>
        }
        renderItem={({ item: method }) => (
          <View style={[styles.card, method.isDefault && styles.cardDefault]}>
            <View style={styles.cardLeft}>
              <Text style={styles.cardIcon}>
                {method.type === 'card' ? (BRAND_ICON[method.brand ?? ''] ?? '💳')
                  : method.type === 'oxxo' ? '🏪'
                  : '🏦'}
              </Text>
              <View>
                <Text style={styles.cardNickname}>{method.nickname}</Text>
                {method.expiry && <Text style={styles.cardMeta}>Vence {method.expiry}</Text>}
                {method.isDefault && <Text style={styles.defaultBadge}>Predeterminada</Text>}
              </View>
            </View>
            <View style={styles.cardActions}>
              {!method.isDefault && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleSetDefault(method.id)}>
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleRemove(method.id)}>
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Add payment method modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => { setShowAdd(false); resetForm(); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {selectedType ? 'Datos de pago' : 'Elige tipo de pago'}
                </Text>
                <TouchableOpacity onPress={() => { setShowAdd(false); resetForm(); }}>
                  <Ionicons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
                {!selectedType ? (
                  TYPE_OPTIONS.map(opt => (
                    <TouchableOpacity key={opt.type} style={styles.typeOption} onPress={() => setSelectedType(opt.type)}>
                      <Ionicons name={opt.icon as any} size={24} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.typeLabel}>{opt.label}</Text>
                        <Text style={styles.typeDesc}>{opt.desc}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))
                ) : selectedType === 'card' ? (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.label}>Número de tarjeta</Text>
                      <TextInput
                        style={styles.input}
                        value={cardNumber}
                        onChangeText={t => setCardNumber(formatCardNumber(t))}
                        placeholder="1234 5678 9012 3456"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        maxLength={19}
                      />
                    </View>
                    <View style={styles.row}>
                      <View style={[styles.field, { flex: 1 }]}>
                        <Text style={styles.label}>Expiración</Text>
                        <TextInput
                          style={styles.input}
                          value={expiry}
                          onChangeText={t => setExpiry(formatExpiry(t))}
                          placeholder="MM/YY"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                          maxLength={5}
                        />
                      </View>
                      <View style={[styles.field, { flex: 1 }]}>
                        <Text style={styles.label}>CVV</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="•••"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                          maxLength={4}
                          secureTextEntry
                          value={cvv}
                          onChangeText={t => setCvv(t.replace(/\D/g, '').slice(0, 4))}
                        />
                      </View>
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.label}>Nombre en la tarjeta</Text>
                      <TextInput
                        style={styles.input}
                        value={cardholderName}
                        onChangeText={setCardholderName}
                        placeholder="Como aparece en la tarjeta"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="words"
                      />
                    </View>
                    <Text style={styles.secureNote}>
                      Integración Stripe/Conekta próximamente — tus datos no se envían aún.
                    </Text>
                    <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={saving}>
                      {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Continuar</Text>}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.altPayDesc}>
                      {selectedType === 'oxxo'
                        ? 'Al ganar una subasta recibirás un código de barras para pagar en cualquier tienda OXXO.'
                        : 'Al ganar una subasta recibirás los datos bancarios para hacer tu transferencia SPEI.'}
                    </Text>
                    <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={saving}>
                      {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Activar {selectedType.toUpperCase()}</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: 60 },
  emptyText: { color: colors.textMuted, fontSize: font.md, marginTop: spacing.md },
  emptyHint: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center', marginTop: 4 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center' },
  cardDefault: { borderColor: colors.primary },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardIcon: { fontSize: 28 },
  cardNickname: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  cardMeta: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  defaultBadge: { color: colors.primary, fontSize: font.sm, fontWeight: '700', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { padding: spacing.xs },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed' },
  addBtnText: { color: colors.primary, fontWeight: '700', fontSize: font.md },
  // modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  typeOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  typeLabel: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  typeDesc: { color: colors.textMuted, fontSize: font.sm },
  field: { gap: 6 },
  label: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: font.md },
  row: { flexDirection: 'row', gap: spacing.md },
  secureNote: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  altPayDesc: { color: colors.textMuted, fontSize: font.md, lineHeight: 22, textAlign: 'center', paddingHorizontal: spacing.md },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: font.md },
});
