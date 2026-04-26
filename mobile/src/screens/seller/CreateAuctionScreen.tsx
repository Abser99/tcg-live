import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { auctionsApi } from '../../api/auctions';
import { CreateAuctionItemPayload } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { authStyles } from '../../theme/authStyles';
import { formatMXN } from '../../utils/currency';
import { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'CreateAuction'>;

type Condition = 'mint' | 'near_mint' | 'excellent' | 'good' | 'played';
const CONDITIONS: { value: Condition; label: string }[] = [
  { value: 'mint', label: 'Mint' },
  { value: 'near_mint', label: 'NM' },
  { value: 'excellent', label: 'EX' },
  { value: 'good', label: 'Good' },
  { value: 'played', label: 'Played' },
];

const EMPTY_ITEM: ItemForm = {
  cardName: '', cardSet: '', cardNumber: '',
  condition: 'near_mint', startingPrice: '', reservePrice: '',
};

interface ItemForm {
  cardName: string;
  cardSet: string;
  cardNumber: string;
  condition: Condition;
  startingPrice: string;
  reservePrice: string;
}

export default function CreateAuctionScreen({ navigation }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [items, setItems] = useState<CreateAuctionItemPayload[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM);

  const addItem = () => {
    const price = Math.round(parseFloat(itemForm.startingPrice) * 100);
    if (!itemForm.cardName.trim()) {
      Alert.alert('Error', 'El nombre de la carta es obligatorio');
      return;
    }
    if (isNaN(price) || price < 1) {
      Alert.alert('Error', 'Ingresa un precio inicial válido');
      return;
    }
    const reserveCents = itemForm.reservePrice
      ? Math.round(parseFloat(itemForm.reservePrice) * 100)
      : undefined;

    const newItem: CreateAuctionItemPayload = {
      cardName: itemForm.cardName.trim(),
      cardSet: itemForm.cardSet.trim() || undefined,
      cardNumber: itemForm.cardNumber.trim() || undefined,
      condition: itemForm.condition,
      startingPrice: price,
      reservePrice: reserveCents && !isNaN(reserveCents) ? reserveCents : undefined,
    };
    setItems((prev) => [...prev, newItem]);
    setItemForm(EMPTY_ITEM);
    setShowItemForm(false);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'El título es obligatorio');
      return;
    }
    let parsedDate: string | undefined;
    if (scheduledAt.trim()) {
      const d = new Date(scheduledAt.trim());
      if (isNaN(d.getTime())) {
        Alert.alert('Error', 'Fecha inválida. Usa el formato: 2026-04-26T20:00');
        return;
      }
      parsedDate = d.toISOString();
    }
    setSubmitting(true);
    try {
      const { data } = await auctionsApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledAt: parsedDate,
        items: items.length > 0 ? items : undefined,
      });
      navigation.replace('ManageAuction', { auctionId: data.id });
    } catch (err: any) {
      const msg = err.response?.data?.message;
      Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : (msg ?? 'No se pudo crear la subasta'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <Text style={styles.sectionTitle}>Información</Text>

        <TextInput
          style={authStyles.input}
          placeholder="Título de la subasta *"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />
        <View style={styles.gap} />
        <TextInput
          style={[authStyles.input, styles.multiline]}
          placeholder="Descripción (opcional)"
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />
        <View style={styles.gap} />
        <TextInput
          style={authStyles.input}
          placeholder="Fecha/hora programada (ej. 2026-04-26T20:00)"
          placeholderTextColor={colors.textMuted}
          value={scheduledAt}
          onChangeText={setScheduledAt}
          autoCapitalize="none"
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Cartas ({items.length})</Text>
          {!showItemForm && (
            <TouchableOpacity onPress={() => setShowItemForm(true)} style={styles.addBtn}>
              <Ionicons name="add" size={16} color={colors.primaryLight} />
              <Text style={styles.addBtnText}>Agregar carta</Text>
            </TouchableOpacity>
          )}
        </View>

        {items.map((item, i) => (
          <View key={i} style={styles.itemChip}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemChipName}>{item.cardName}</Text>
              <Text style={styles.itemChipMeta}>
                {item.condition?.toUpperCase()} · {formatMXN(item.startingPrice)}
                {item.cardSet ? ` · ${item.cardSet}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={() => removeItem(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ))}

        {showItemForm && (
          <View style={styles.itemForm}>
            <TextInput
              style={authStyles.input}
              placeholder="Nombre de la carta *"
              placeholderTextColor={colors.textMuted}
              value={itemForm.cardName}
              onChangeText={(v) => setItemForm((p) => ({ ...p, cardName: v }))}
            />
            <View style={styles.row}>
              <TextInput
                style={[authStyles.input, { flex: 1 }]}
                placeholder="Set (opcional)"
                placeholderTextColor={colors.textMuted}
                value={itemForm.cardSet}
                onChangeText={(v) => setItemForm((p) => ({ ...p, cardSet: v }))}
              />
              <TextInput
                style={[authStyles.input, styles.numberInput]}
                placeholder="#"
                placeholderTextColor={colors.textMuted}
                value={itemForm.cardNumber}
                onChangeText={(v) => setItemForm((p) => ({ ...p, cardNumber: v }))}
              />
            </View>

            <Text style={styles.label}>Condición</Text>
            <View style={styles.conditionRow}>
              {CONDITIONS.map(({ value, label }) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.conditionBtn, itemForm.condition === value && styles.conditionBtnActive]}
                  onPress={() => setItemForm((p) => ({ ...p, condition: value }))}
                >
                  <Text style={[styles.conditionText, itemForm.condition === value && styles.conditionTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Precio inicial (MXN) *</Text>
                <TextInput
                  style={authStyles.input}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  value={itemForm.startingPrice}
                  onChangeText={(v) => setItemForm((p) => ({ ...p, startingPrice: v }))}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Reserva (opcional)</Text>
                <TextInput
                  style={authStyles.input}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  value={itemForm.reservePrice}
                  onChangeText={(v) => setItemForm((p) => ({ ...p, reservePrice: v }))}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.formBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, flex: 1 }]}
                onPress={() => { setShowItemForm(false); setItemForm(EMPTY_ITEM); }}
              >
                <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.formBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={addItem}>
                <Text style={{ color: colors.white, fontWeight: '700' }}>Agregar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[authStyles.button, submitting && authStyles.buttonDisabled, styles.submitBtn]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={authStyles.buttonText}>Crear Subasta</Text>
          )}
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700', marginTop: spacing.xl, marginBottom: spacing.sm },
  gap: { height: spacing.sm },
  multiline: { height: 88, textAlignVertical: 'top', paddingTop: spacing.sm },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { color: colors.primaryLight, fontSize: font.sm, fontWeight: '600' },
  itemChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.sm, marginBottom: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  itemChipName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  itemChipMeta: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  itemForm: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    gap: spacing.sm, marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  numberInput: { width: 72 },
  label: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600', marginBottom: 4 },
  conditionRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  conditionBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
  },
  conditionBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  conditionText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  conditionTextActive: { color: colors.white },
  formBtn: {
    paddingVertical: spacing.sm, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtn: { marginTop: spacing.xxl },
});
