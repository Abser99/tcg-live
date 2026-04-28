import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { usersApi } from '../../api/users';
import { useAuthStore } from '../../store/auth.store';
import { colors, spacing, radius, font } from '../../theme';
import { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'AddressSettings'>;

export default function AddressSettingsScreen({ navigation }: Props) {
  const { user, setUser } = useAuthStore();

  const [zipCode, setZipCode]   = useState(user?.zipCode  ?? '');
  const [street,  setStreet]    = useState(user?.street   ?? '');
  const [colonia, setColonia]   = useState(user?.colonia  ?? '');
  const [city,    setCity]      = useState(user?.city     ?? '');
  const [state,   setState]     = useState(user?.state    ?? '');
  const [saving,  setSaving]    = useState(false);

  const handleSave = async () => {
    if (zipCode && !/^\d{5}$/.test(zipCode)) {
      Alert.alert('CP inválido', 'El código postal debe tener exactamente 5 dígitos.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await usersApi.updateAddress({ zipCode, street, colonia, city, state });
      setUser(data);
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'No se pudo guardar la dirección');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          Tu dirección se usa para cotizar envíos. Solo el código postal es requerido.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Código postal *</Text>
          <TextInput
            style={styles.input}
            value={zipCode}
            onChangeText={setZipCode}
            placeholder="Ej. 44100"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            maxLength={5}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Calle y número</Text>
          <TextInput
            style={styles.input}
            value={street}
            onChangeText={setStreet}
            placeholder="Ej. Av. Juárez 123"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Colonia</Text>
          <TextInput
            style={styles.input}
            value={colonia}
            onChangeText={setColonia}
            placeholder="Ej. Centro"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>Ciudad</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="Ej. Guadalajara"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>Estado</Text>
            <TextInput
              style={styles.input}
              value={state}
              onChangeText={setState}
              placeholder="Ej. Jalisco"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.btn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Guardar dirección</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  hint: { color: colors.textMuted, fontSize: font.sm, lineHeight: 20 },
  field: { gap: 6 },
  label: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md,
    color: colors.text, fontSize: font.md,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  btn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.sm,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: font.md },
});
