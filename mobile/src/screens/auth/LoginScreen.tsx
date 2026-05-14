import React, { useEffect, useRef, useState } from 'react';
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
import Pokeball from '../../components/Pokeball';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

function FeatureBadge({ icon, label, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }) {
  return (
    <View style={[styles.featureBadge, { borderColor: color + '44', backgroundColor: color + '12' }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.featureBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading } = useAuthStore();

  // Subtle entrance animation for the card
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardY = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 420, delay: 120, useNativeDriver: true }),
      Animated.spring(cardY, { toValue: 0, friction: 8, tension: 80, delay: 120, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Por favor llena todos los campos');
      return;
    }
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message ?? 'Credenciales inválidas');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo / Hero */}
        <View style={styles.logoWrap}>
          {/* Multi-layer glow */}
          <View style={styles.glowXl} />
          <View style={styles.glowLg} />
          <View style={styles.glowSm} />

          <Pokeball size={80} topColor={colors.primary} />

          <Text style={styles.logo}>
            TCG<Text style={styles.logoAccent}> LIVE</Text>
          </Text>
          <Text style={styles.subtitle}>Subastas en vivo · Cartas premium</Text>

          {/* Feature badges row */}
          <View style={styles.badgesRow}>
            <FeatureBadge icon="flash"              label="En vivo"   color={colors.error} />
            <FeatureBadge icon="shield-checkmark"   label="Seguro"    color={colors.success} />
            <FeatureBadge icon="trophy"             label="Pokémon · MTG" color={colors.gold} />
          </View>
        </View>

        {/* Form card */}
        <Animated.View style={[styles.card, { opacity: cardOpacity, transform: [{ translateY: cardY }] }]}>
          <Text style={styles.cardTitle}>Bienvenido de vuelta</Text>
          <Text style={styles.cardSubtitle}>Inicia sesión para seguir pujando</Text>

          {/* Email field */}
          <View style={[styles.fieldWrap, emailFocused && styles.fieldWrapFocused]}>
            <View style={[styles.fieldIconWrap, emailFocused && { backgroundColor: colors.primary + '28' }]}>
              <Ionicons name="mail-outline" size={18} color={emailFocused ? colors.primary : colors.textMuted} />
            </View>
            <TextInput
              style={styles.fieldInput}
              placeholder="Correo electrónico"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
            />
          </View>

          {/* Password field */}
          <View style={[styles.fieldWrap, passwordFocused && styles.fieldWrapFocused]}>
            <View style={[styles.fieldIconWrap, passwordFocused && { backgroundColor: colors.primary + '28' }]}>
              <Ionicons name="lock-closed-outline" size={18} color={passwordFocused ? colors.primary : colors.textMuted} />
            </View>
            <TextInput
              style={styles.fieldInput}
              placeholder="Contraseña"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(p => !p)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[authStyles.button, isLoading && authStyles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading
              ? <ActivityIndicator color={colors.white} />
              : (
                <View style={styles.btnInner}>
                  <Ionicons name="log-in-outline" size={20} color={colors.white} />
                  <Text style={authStyles.buttonText}>Entrar</Text>
                </View>
              )
            }
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity
          onPress={() => navigation.navigate('Register')}
          style={styles.linkWrap}
          activeOpacity={0.7}
        >
          <Text style={authStyles.link}>
            ¿No tienes cuenta?{'  '}
            <Text style={authStyles.linkAccent}>Regístrate gratis →</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xl },

  // Logo hero
  logoWrap: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.sm, position: 'relative', paddingTop: 24 },
  glowXl: {
    position: 'absolute',
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: colors.primary + '0D',
    top: -60,
  },
  glowLg: {
    position: 'absolute',
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: colors.primary + '1A',
    top: -28,
  },
  glowSm: {
    position: 'absolute',
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: colors.primary + '28',
    top: -4,
  },
  logo: {
    fontSize: 44, fontWeight: '900',
    color: colors.text, textAlign: 'center', letterSpacing: -2,
    marginTop: spacing.sm,
  },
  logoAccent: { color: colors.primaryLight },
  subtitle: { fontSize: font.md, color: colors.textMuted, textAlign: 'center', letterSpacing: 0.3 },
  badgesRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'center', marginTop: spacing.xs },
  featureBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1,
  },
  featureBadgeText: { fontSize: font.xs, fontWeight: '700' },

  // Form card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  cardTitle: {
    color: colors.text, fontSize: font.xl, fontWeight: '900',
    letterSpacing: -0.5,
  },
  cardSubtitle: {
    color: colors.textMuted, fontSize: font.sm,
    marginTop: -spacing.sm,
  },

  // Decorated input fields
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  fieldWrapFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.bg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  fieldIconWrap: {
    width: 46, height: 52,
    alignItems: 'center', justifyContent: 'center',
    borderRightWidth: 1, borderRightColor: colors.border,
    backgroundColor: 'transparent',
  },
  fieldInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: font.base,
  },
  eyeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },

  btnInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  linkWrap: { paddingVertical: spacing.sm },
});
