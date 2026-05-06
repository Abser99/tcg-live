import React, { useRef, useState } from 'react';
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
  Animated,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth.store';
import { colors, spacing, font, radius } from '../../theme';
import { authStyles } from '../../theme/authStyles';
import { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

const PERKS = [
  { icon: 'flash' as const,               color: colors.error,   text: 'Subastas en tiempo real' },
  { icon: 'shield-checkmark' as const,    color: colors.success, text: 'Pagos seguros' },
  { icon: 'albums' as const,              color: colors.gold,    text: 'Miles de cartas' },
];

interface FieldProps {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  secureTextEntry?: boolean;
  keyboardType?: 'email-address' | 'default';
  autoCapitalize?: 'none' | 'sentences';
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
}

function Field({
  icon, placeholder, value, onChangeText,
  isFocused, onFocus, onBlur,
  secureTextEntry, keyboardType, autoCapitalize, returnKeyType, onSubmitEditing,
}: FieldProps) {
  const [showSec, setShowSec] = useState(false);
  return (
    <View style={[
      fieldStyles.wrap,
      isFocused && { borderColor: colors.primary, backgroundColor: colors.bg },
    ]}>
      <View style={[fieldStyles.iconWrap, isFocused && { backgroundColor: colors.primary + '28' }]}>
        <Ionicons name={icon} size={17} color={isFocused ? colors.primary : colors.textMuted} />
      </View>
      <TextInput
        style={fieldStyles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        secureTextEntry={secureTextEntry && !showSec}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        returnKeyType={returnKeyType ?? 'next'}
        onSubmitEditing={onSubmitEditing}
      />
      {secureTextEntry && (
        <TouchableOpacity
          style={fieldStyles.eyeBtn}
          onPress={() => setShowSec(p => !p)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={showSec ? 'eye-off-outline' : 'eye-outline'} size={17} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  iconWrap: {
    width: 44, height: 50, alignItems: 'center', justifyContent: 'center',
    borderRightWidth: 1, borderRightColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  input: {
    flex: 1, paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    color: colors.text, fontSize: font.base,
  },
  eyeBtn: { paddingHorizontal: spacing.md },
});

export default function RegisterScreen({ navigation }: Props) {
  const [email, setEmail]       = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { register, isLoading } = useAuthStore();

  const formOpacity = useRef(new Animated.Value(0)).current;
  const formY       = useRef(new Animated.Value(20)).current;
  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(formOpacity, { toValue: 1, duration: 400, delay: 100, useNativeDriver: true }),
      Animated.spring(formY, { toValue: 0, friction: 8, tension: 80, delay: 100, useNativeDriver: true }),
    ]).start();
  }, []);

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
  const focus = (field: string) => () => setFocusedField(field);
  const blur = () => setFocusedField(null);

  // Password strength
  const passwordStrength = password.length === 0 ? 0
    : password.length < 6 ? 1
    : password.length < 8 ? 2
    : password.length < 12 ? 3 : 4;

  const strengthColor = ['transparent', colors.error, colors.warning, colors.accent, colors.success][passwordStrength];
  const strengthLabel = ['', 'Muy corta', 'Corta', 'Buena', 'Fuerte'][passwordStrength];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerWrap}>
          <View style={styles.headerGlowOuter} />
          <View style={styles.headerGlowInner} />
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.titleSub}>Únete a la comunidad TCG Live</Text>
          <View style={styles.perksRow}>
            {PERKS.map(p => (
              <View key={p.text} style={[styles.perk, { borderColor: p.color + '44', backgroundColor: p.color + '12' }]}>
                <Ionicons name={p.icon} size={13} color={p.color} />
                <Text style={[styles.perkText, { color: p.color }]}>{p.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Form */}
        <Animated.View style={[styles.form, { opacity: formOpacity, transform: [{ translateY: formY }] }]}>
          <Field
            icon="mail-outline"
            placeholder="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            isFocused={focused('email')}
            onFocus={focus('email')}
            onBlur={blur}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            icon="at-circle-outline"
            placeholder="Nombre de usuario"
            value={username}
            onChangeText={setUsername}
            isFocused={focused('username')}
            onFocus={focus('username')}
            onBlur={blur}
            autoCapitalize="none"
          />
          <Field
            icon="lock-closed-outline"
            placeholder="Contraseña"
            value={password}
            onChangeText={setPassword}
            isFocused={focused('password')}
            onFocus={focus('password')}
            onBlur={blur}
            secureTextEntry
          />

          {/* Password strength bar */}
          {password.length > 0 && (
            <View style={styles.strengthWrap}>
              <View style={styles.strengthBar}>
                {[1, 2, 3, 4].map(i => (
                  <View
                    key={i}
                    style={[
                      styles.strengthSegment,
                      { backgroundColor: i <= passwordStrength ? strengthColor : colors.border },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.strengthLabel, { color: strengthColor }]}>{strengthLabel}</Text>
            </View>
          )}

          <Field
            icon="checkmark-circle-outline"
            placeholder="Confirmar contraseña"
            value={confirm}
            onChangeText={setConfirm}
            isFocused={focused('confirm')}
            onFocus={focus('confirm')}
            onBlur={blur}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleRegister}
          />

          <TouchableOpacity
            style={[authStyles.button, isLoading && authStyles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <View style={styles.btnInner}>
                <Ionicons name="person-add-outline" size={20} color={colors.white} />
                <Text style={authStyles.buttonText}>Crear cuenta</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.termsText}>
            Al registrarte aceptas nuestros{' '}
            <Text style={styles.termsLink}>Términos de uso</Text>
            {' '}y{' '}
            <Text style={styles.termsLink}>Privacidad</Text>
          </Text>
        </Animated.View>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.linkWrap}
          activeOpacity={0.7}
        >
          <Text style={authStyles.link}>
            ¿Ya tienes cuenta?{'  '}
            <Text style={authStyles.linkAccent}>Inicia sesión →</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },

  headerWrap: { alignItems: 'center', marginBottom: spacing.xl, position: 'relative', paddingTop: 8 },
  headerGlowOuter: {
    position: 'absolute', width: 220, height: 120, borderRadius: 110,
    backgroundColor: colors.primary + '10', top: -20,
  },
  headerGlowInner: {
    position: 'absolute', width: 140, height: 80, borderRadius: 70,
    backgroundColor: colors.primary + '1C', top: -8,
  },
  title: {
    fontSize: font.xxl, fontWeight: '900', color: colors.text,
    textAlign: 'center', letterSpacing: -1, marginBottom: spacing.xs,
  },
  titleSub: {
    fontSize: font.md, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md,
  },
  perksRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'center' },
  perk: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1,
  },
  perkText: { fontSize: font.xs, fontWeight: '700' },

  form: {
    gap: spacing.md, marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 24, elevation: 8,
  },

  // Password strength
  strengthWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: -spacing.xs,
  },
  strengthBar: { flex: 1, flexDirection: 'row', gap: 4 },
  strengthSegment: {
    flex: 1, height: 3, borderRadius: 2,
  },
  strengthLabel: { fontSize: font.xs, fontWeight: '700', minWidth: 60 },

  btnInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  termsText: {
    color: colors.textMuted, fontSize: font.xs, textAlign: 'center',
    marginTop: -spacing.xs, lineHeight: 18,
  },
  termsLink: { color: colors.primaryLight, fontWeight: '700' },

  linkWrap: { paddingVertical: spacing.sm },
});
