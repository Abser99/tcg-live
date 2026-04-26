import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { sellerApplicationsApi } from '../../api/seller-applications';
import { colors, spacing, radius, font } from '../../theme';
import { ProfileStackParamList } from '../../navigation/types';

const MX_STATES = [
  'Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas',
  'Chihuahua','Ciudad de México','Coahuila','Colima','Durango','Guanajuato',
  'Guerrero','Hidalgo','Jalisco','Estado de México','Michoacán','Morelos',
  'Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo',
  'San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala',
  'Veracruz','Yucatán','Zacatecas',
];

type Props = NativeStackScreenProps<ProfileStackParamList, 'ApplySeller'>;

export default function ApplySellerScreen({ navigation }: Props) {
  const [fullName, setFullName] = useState('');
  const [state, setState] = useState('');
  const [description, setDescription] = useState('');
  const [showStates, setShowStates] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!fullName || !state || !description) {
      Alert.alert('Error', 'Por favor llena todos los campos');
      return;
    }
    if (description.length < 20) {
      Alert.alert('Error', 'La descripción debe tener al menos 20 caracteres');
      return;
    }
    setLoading(true);
    try {
      await sellerApplicationsApi.apply(fullName, state, description);
      Alert.alert('¡Solicitud enviada!', 'Te notificaremos cuando sea revisada.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message ?? 'No se pudo enviar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Solicitar ser vendedor</Text>
      <Text style={styles.subtitle}>
        Revisaremos tu solicitud y te contactaremos en 1-3 días hábiles.
      </Text>

      <View style={styles.form}>
        <View>
          <Text style={styles.label}>Nombre completo</Text>
          <TextInput
            style={styles.input}
            placeholder="Tu nombre real"
            placeholderTextColor={colors.textMuted}
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        <View>
          <Text style={styles.label}>Estado</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowStates(!showStates)}>
            <Text style={state ? styles.inputText : styles.placeholder}>
              {state || 'Selecciona tu estado'}
            </Text>
          </TouchableOpacity>
          {showStates && (
            <View style={styles.dropdown}>
              {MX_STATES.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={styles.dropdownItem}
                  onPress={() => { setState(s); setShowStates(false); }}
                >
                  <Text style={[styles.dropdownText, s === state && styles.dropdownSelected]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View>
          <Text style={styles.label}>¿Qué vendes? Cuéntanos sobre ti</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Ej: Llevo 5 años coleccionando Pokémon, me especializo en cartas vintage..."
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{description.length}/500</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Enviar solicitud</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  title: { color: colors.text, fontSize: font.xl, fontWeight: '800', marginBottom: spacing.xs },
  subtitle: { color: colors.textMuted, fontSize: font.md, marginBottom: spacing.xl, lineHeight: 22 },
  form: { gap: spacing.lg },
  label: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600', marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: font.base,
  },
  inputText: { color: colors.text, fontSize: font.base },
  placeholder: { color: colors.textMuted, fontSize: font.base },
  textarea: { minHeight: 120 },
  charCount: { color: colors.textMuted, fontSize: font.sm, textAlign: 'right', marginTop: 4 },
  dropdown: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    maxHeight: 200,
    marginTop: 4,
  },
  dropdownItem: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  dropdownText: { color: colors.text, fontSize: font.md },
  dropdownSelected: { color: colors.primaryLight, fontWeight: '700' },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontSize: font.base, fontWeight: '700' },
});
