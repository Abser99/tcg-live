import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Switch, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { colors, spacing, radius, font } from '../../theme';
import { authStyles } from '../../theme/authStyles';
import { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ShippingSettings'>;

export default function ShippingSettingsScreen({ navigation }: Props) {
  const { user, setUser } = useAuthStore();
  const [note, setNote] = useState((user as any)?.shippingNote ?? '');
  const [insurance, setInsurance] = useState((user as any)?.shippingInsurance ?? false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch('/users/me/shipping', {
        shippingNote: note.trim() || undefined,
        shippingInsurance: insurance,
      });
      if (setUser) setUser(data);
      Alert.alert('Guardado', 'Configuración de envíos actualizada');
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'No se pudo guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        <Text style={styles.label}>Horarios / notas de envío</Text>
        <TextInput
          style={[authStyles.input, styles.multiline]}
          placeholder={'Ej: Envío los martes y viernes a la CDMX\nPaqueterías: Estafeta y DHL'}
          placeholderTextColor={colors.textMuted}
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={4}
        />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Incluir seguro de mercancía</Text>
            <Text style={styles.switchDesc}>El costo del seguro se agrega automáticamente al envío</Text>
          </View>
          <Switch
            value={insurance}
            onValueChange={setInsurance}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.white}
          />
        </View>

        <TouchableOpacity
          style={[authStyles.button, saving && authStyles.buttonDisabled, styles.saveBtn]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={colors.white} />
            : <Text style={authStyles.buttonText}>Guardar</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  label: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600', marginBottom: 4 },
  multiline: { height: 100, textAlignVertical: 'top', paddingTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  switchLabel: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  switchDesc: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  saveBtn: { marginTop: spacing.md },
});
