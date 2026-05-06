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
import { useAuthStore } from '../../store/auth.store';
import { colors, spacing, font, radius } from '../../theme';
import { authStyles } from '../../theme/authStyles';
import { AuthStackParamList } from '../../navigation/types';
import Pokeball from '../../components/Pokeball';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const { login, isLoading } = useAuthStore();

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
          <View style={styles.logoGlowOuter} />
          <View style={styles.logoGlowInner} />
          <Pokeball size={76} topColor={colors.primary} />
          <Text style={styles.logo}>TCG Live</Text>
          <Text style={styles.subtitle}>Subastas en vivo de cartas</Text>
          <View style={styles.tagRow}>
            <View style={styles.tag}><Text style={styles.tagText}>⚡ Pokémon</Text></View>
            <View style={styles.tag}><Text style={styles.tagText}>🔮 MTG</Text></View>
            <View style={styles.tag}><Text style={styles.tagText}>👁 Yu-Gi-Oh</Text></View>
          </View>
        </View>

        {/* Form card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Iniciar sesión</Text>
          <TextInput
            style={[authStyles.input, emailFocused && styles.inputFocused]}
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
          <TextInput
            style={[authStyles.input, passwordFocused && styles.inputFocused]}
            placeholder="Contraseña"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            style={[authStyles.button, isLoading && authStyles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={authStyles.buttonText}>Entrar</Text>
            }
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate('Register')}
          style={styles.linkWrap}
          activeOpacity={0.7}
        >
          <Text style={authStyles.link}>
            ¿No tienes cuenta? <Text style={authStyles.linkAccent}>Regístrate gratis</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xl },

  logoWrap: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.sm },
  logoGlowOuter: {
    position: 'absolute',
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: colors.primary + '14',
    top: -40,
  },
  logoGlowInner: {
    position: 'absolute',
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: colors.primary + '22',
    top: -16,
  },
  logo: {
    fontSize: 42, fontWeight: '900',
    color: colors.text, textAlign: 'center', letterSpacing: -1.5,
    marginTop: spacing.sm,
  },
  subtitle: { fontSize: font.md, color: colors.textMuted, textAlign: 'center' },
  tagRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'center', marginTop: spacing.xs },
  tag: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  tagText: { color: colors.textMuted, fontSize: font.xs, fontWeight: '600' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  cardTitle: {
    color: colors.text, fontSize: font.lg, fontWeight: '800',
    marginBottom: spacing.xs, letterSpacing: -0.3,
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  linkWrap: { paddingVertical: spacing.sm },
});
