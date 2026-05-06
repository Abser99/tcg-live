import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth.store';
import { colors, spacing, font, radius } from '../../theme';
import { authStyles } from '../../theme/authStyles';
import { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

const PERKS = [
  { icon: 'flash-outline' as const,       text: 'Pujas en tiempo real' },
  { icon: 'shield-checkmark-outline' as const, text: 'Pagos seguros' },
  { icon: 'storefront-outline' as const,  text: 'Miles de cartas' },
];

export default function RegisterScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { register, isLoading } = useAuthStore();

  const handleRegister = async () => {
    if (!email || !username || !password || !confirm) {
      Alert.alert('Error', 'Por favor llena todos los campos');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Error', 'Las contraseñas no coinciden');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'La contraseña debe tener al menos 8 caracteres');
      return;
    }
    try {
      await register(email.trim().toLowerCase(), username.trim(), password);
    } catch (err: any) {
      const msg = err.response?.data?.message;
      Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : (msg ?? 'Error al registrarse'));
    }
  };

  const focused = (field: string) => focusedField === field;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.headerWrap}>
          <View style={styles.headerGlow} />
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.titleSub}>Únete a la comunidad TCG Live</Text>
          <View style={styles.perksRow}>
            {PERKS.map(p => (
              <View key={p.text} style={styles.perk}>
                <Ionicons name={p.icon} size={15} color={colors.primaryLight} />
                <Text style={styles.perkText}>{p.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={[authStyles.input, focused('email') && styles.inputFocused]}
            placeholder="Correo electrónico"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocusedField('email')}
            onBlur={() => setFocusedField(null)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={[authStyles.input, focused('username') && styles.inputFocused]}
            placeholder="Nombre de usuario"
            placeholderTextColor={colors.textMuted}
            value={username}
            onChangeText={setUsername}
            onFocus={() => setFocusedField('username')}
            onBlur={() => setFocusedField(null)}
            autoCapitalize="none"
          />
          <TextInput
            style={[authStyles.input, focused('password') && styles.inputFocused]}
            placeholder="Contraseña"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocusedField('password')}
            onBlur={() => setFocusedField(null)}
            secureTextEntry
          />
          <TextInput
            style={[authStyles.input, focused('confirm') && styles.inputFocused]}
            placeholder="Confirmar contraseña"
            placeholderTextColor={colors.textMuted}
            value={confirm}
            onChangeText={setConfirm}
            onFocus={() => setFocusedField('confirm')}
            onBlur={() => setFocusedField(null)}
            secureTextEntry
          />

          {/* Password strength hint */}
          <View style={styles.hintRow}>
            <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} />
            <Text style={styles.hintText}>Mínimo 8 caracteres</Text>
          </View>

          <TouchableOpacity
            style={[authStyles.button, isLoading && authStyles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={authStyles.buttonText}>Crear cuenta</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.linkWrap}
          activeOpacity={0.7}
        >
          <Text style={authStyles.link}>
            ¿Ya tienes cuenta? <Text style={authStyles.linkAccent}>Inicia sesión</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },

  headerWrap: { alignItems: 'center', marginBottom: spacing.xl },
  headerGlow: {
    position: 'absolute',
    width: 180, height: 100, borderRadius: 90,
    backgroundColor: colors.primary + '18',
    top: -20,
  },
  title: {
    fontSize: font.xxl, fontWeight: '900', color: colors.text,
    textAlign: 'center', letterSpacing: -0.8, marginBottom: spacing.xs,
  },
  titleSub: {
    fontSize: font.md, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md,
  },
  perksRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  perk: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.surface, borderRadius: radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.border,
  },
  perkText: { color: colors.textMuted, fontSize: font.xs, fontWeight: '600' },

  form: {
    gap: spacing.md, marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20, elevation: 6,
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.bg,
  },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -spacing.xs },
  hintText: { color: colors.textMuted, fontSize: font.xs },
  linkWrap: { paddingVertical: spacing.sm },
});
