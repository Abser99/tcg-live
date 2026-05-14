import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, Animated, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth.store';
import { sellerApplicationsApi } from '../../api/seller-applications';
import { SellerApplication, ApplicationStatus } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ProfileHome'>;

const STATUS_LABEL: Record<ApplicationStatus, { label: string; color: string; icon: any }> = {
  pending:  { label: 'Solicitud en revisión', color: colors.warning,  icon: 'time-outline' },
  approved: { label: 'Vendedor aprobado',     color: colors.success,  icon: 'checkmark-circle-outline' },
  rejected: { label: 'Solicitud rechazada',   color: colors.error,    icon: 'close-circle-outline' },
};

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}

function AnimatedMenuItem({ item, index }: { item: MenuItem; index: number }) {
  const translateX = useRef(new Animated.Value(50)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const scale      = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        delay: index * 55,
        useNativeDriver: true,
        friction: 8,
        tension: 100,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        delay: index * 55,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const pressIn  = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, friction: 10 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start();

  return (
    <Animated.View style={{ transform: [{ translateX }, { scale }], opacity }}>
      <TouchableOpacity
        style={styles.menuRow}
        onPress={item.onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        activeOpacity={1}
      >
        <View style={[styles.menuIconWrap, { backgroundColor: item.color + '1A' }]}>
          <Ionicons name={item.icon} size={20} color={item.color} />
        </View>
        <Text style={styles.menuLabel}>{item.label}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted + '88'} />
      </TouchableOpacity>
    </Animated.View>
  );
}

function MenuSection({ items, title }: { items: MenuItem[]; title?: string }) {
  return (
    <View style={styles.section}>
      {title && <Text style={styles.sectionTitle}>{title}</Text>}
      <View style={styles.sectionCard}>
        {items.map((item, i) => (
          <React.Fragment key={item.label}>
            <AnimatedMenuItem item={item} index={i} />
            {i < items.length - 1 && <View style={styles.divider} />}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

export default function ProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const [application, setApplication] = useState<SellerApplication | null>(null);
  const [loadingApp, setLoadingApp] = useState(false);

  const avatarScale   = useRef(new Animated.Value(0.6)).current;
  const avatarOpacity = useRef(new Animated.Value(0)).current;
  const ringPulse     = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(avatarScale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 100 }),
      Animated.timing(avatarOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();

    const ring = Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, { toValue: 1.1, duration: 1400, useNativeDriver: true }),
        Animated.timing(ringPulse, { toValue: 1,   duration: 1400, useNativeDriver: true }),
      ])
    );
    ring.start();
    return () => ring.stop();
  }, []);

  useEffect(() => {
    if (user?.role === 'buyer') {
      setLoadingApp(true);
      sellerApplicationsApi.getMyApplication()
        .then(({ data }) => setApplication(data))
        .catch(() => {})
        .finally(() => setLoadingApp(false));
    }
  }, [user?.role]);

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: logout },
    ]);
  };

  const roleBadge = () => {
    if (user?.role === 'admin')  return { label: 'Admin',    color: colors.error,   icon: 'shield-outline' as const };
    if (user?.role === 'seller') return { label: 'Vendedor', color: colors.gold,    icon: 'storefront-outline' as const };
    return { label: 'Entrenador', color: colors.accent, icon: 'person-outline' as const };
  };
  const badge = roleBadge();

  const mainMenuItems: MenuItem[] = [
    { icon: 'receipt-outline',  label: 'Mis Compras',  color: colors.accent,        onPress: () => navigation.navigate('MyOrders') },
    { icon: 'pricetag-outline', label: 'Mis Pujas',    color: colors.primaryLight,  onPress: () => navigation.navigate('MyBids') },
    { icon: 'bookmark-outline', label: 'Guardados',    color: colors.warning,       onPress: () => navigation.navigate('Watchlist') },
  ];

  const settingsItems: MenuItem[] = [
    { icon: 'card-outline',     label: 'Formas de Pago',  color: colors.gold,    onPress: () => navigation.navigate('PaymentMethods') },
    { icon: 'location-outline', label: `Mi Dirección${user?.zipCode ? ` · CP ${user.zipCode}` : ''}`, color: colors.success, onPress: () => navigation.navigate('AddressSettings') },
  ];

  const sellerItems: MenuItem[] = [
    { icon: 'albums-outline',        label: 'Mis Subastas',      color: colors.primaryLight, onPress: () => navigation.navigate('SellerDashboard') },
    { icon: 'cube-outline',          label: 'Configurar Envíos', color: colors.warning,      onPress: () => navigation.navigate('ShippingSettings') },
    { icon: 'document-text-outline', label: 'Documentos',        color: colors.accent,       onPress: () => navigation.navigate('SellerDocuments') },
  ];

  const adminItems: MenuItem[] = [
    { icon: 'people-outline',       label: 'Solicitudes de vendedores', color: colors.error,   onPress: () => navigation.navigate('AdminApplications') },
    { icon: 'alert-circle-outline', label: 'Disputas',                  color: colors.warning, onPress: () => navigation.navigate('AdminDisputes') },
  ];

  const initials = user?.username?.[0]?.toUpperCase() ?? '?';

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero / Avatar section */}
      <View style={styles.hero}>
        <View style={styles.heroBg} />
        <Animated.View style={[styles.avatarWrap, { transform: [{ scale: avatarScale }], opacity: avatarOpacity }]}>
          <Animated.View style={[styles.avatarRingOuter, { transform: [{ scale: ringPulse }] }]} />
          <View style={styles.avatarRingInner} />
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </Animated.View>

        <View style={styles.usernameRow}>
          <Text style={styles.username}>@{user?.username}</Text>
          {user?.isVerified && (
            <Ionicons name="checkmark-circle" size={18} color="#3b82f6" />
          )}
        </View>
        <View style={[styles.roleBadge, { backgroundColor: badge.color + '1A', borderColor: badge.color + '55' }]}>
          <Ionicons name={badge.icon} size={12} color={badge.color} />
          <Text style={[styles.roleText, { color: badge.color }]}>{badge.label}</Text>
        </View>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsCard}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {user?.averageRating != null ? user.averageRating.toFixed(1) : '—'}
          </Text>
          <Text style={styles.statLabel}>{user?.totalRatings ? `${user.totalRatings} reseñas` : 'Sin reseñas'}</Text>
          {user?.averageRating != null && (
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(s => (
                <Ionicons
                  key={s}
                  name={s <= Math.round(user.averageRating ?? 0) ? 'star' : 'star-outline'}
                  size={10}
                  color={colors.gold}
                />
              ))}
            </View>
          )}
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.gold }]}>{user?.reputationScore ?? 0}</Text>
          <Text style={styles.statLabel}>Reputación</Text>
          <View style={styles.xpBadge}>
            <Ionicons name="diamond-outline" size={10} color={colors.gold} />
            <Text style={styles.xpText}>XP</Text>
          </View>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Ionicons
            name={user?.role === 'seller' ? 'storefront' : user?.role === 'admin' ? 'shield' : 'person'}
            size={22}
            color={badge.color}
          />
          <Text style={[styles.statLabel, { marginTop: 2 }]}>Rol</Text>
          <View style={[styles.roleSmBadge, { borderColor: badge.color + '55', backgroundColor: badge.color + '18' }]}>
            <Text style={[styles.roleSmText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>
      </View>

      {/* Seller application or CTA */}
      {user?.role === 'buyer' && (
        <View style={styles.section}>
          {loadingApp ? (
            <ActivityIndicator color={colors.primary} />
          ) : application ? (
            <View style={[styles.sectionCard, { padding: spacing.md }]}>
              <View style={styles.appRow}>
                <View style={[styles.appIconWrap, { backgroundColor: STATUS_LABEL[application.status].color + '1A' }]}>
                  <Ionicons name={STATUS_LABEL[application.status].icon} size={18} color={STATUS_LABEL[application.status].color} />
                </View>
                <Text style={[styles.appText, { color: STATUS_LABEL[application.status].color }]}>
                  {STATUS_LABEL[application.status].label}
                </Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.sellerCta}
              onPress={() => navigation.navigate('ApplySeller')}
              activeOpacity={0.85}
            >
              <View style={styles.sellerCtaIcon}>
                <Ionicons name="storefront-outline" size={22} color={colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sellerCtaTitle}>¡Conviértete en vendedor!</Text>
                <Text style={styles.sellerCtaSub}>Crea subastas en vivo y llega a miles</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.gold + 'AA'} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <MenuSection items={mainMenuItems} title="ACTIVIDAD" />
      <MenuSection items={settingsItems} title="CONFIGURACIÓN" />
      {(user?.role === 'seller' || user?.role === 'admin') && (
        <MenuSection items={sellerItems} title="VENDEDOR" />
      )}
      {user?.role === 'admin' && (
        <MenuSection items={adminItems} title="ADMIN" />
      )}

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={20} color={colors.error} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { alignItems: 'center', paddingBottom: spacing.xxl },

  // Hero
  hero: {
    width: '100%', alignItems: 'center',
    paddingTop: spacing.xl, paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  heroBg: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 140,
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },

  // Avatar
  avatarWrap: {
    position: 'relative', alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarRingOuter: {
    position: 'absolute',
    width: 104, height: 104, borderRadius: 52,
    borderWidth: 1.5, borderColor: colors.gold + '44',
  },
  avatarRingInner: {
    position: 'absolute',
    width: 92, height: 92, borderRadius: 46,
    borderWidth: 2, borderColor: colors.gold + '33',
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: colors.surface,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12, elevation: 8,
  },
  avatarText: { color: colors.white, fontSize: 32, fontWeight: '900' },

  usernameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: spacing.xs, flexWrap: 'wrap', justifyContent: 'center',
  },
  username: { color: colors.text, fontSize: font.xl, fontWeight: '900', letterSpacing: -0.3 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.full, borderWidth: 1, marginBottom: spacing.xs,
  },
  roleText: { fontSize: font.sm, fontWeight: '700', letterSpacing: 0.4 },
  email: { color: colors.textMuted, fontSize: font.sm },

  // Stats
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface, borderRadius: radius.xl,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.xl,
    gap: spacing.xl, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.xl,
    alignSelf: 'stretch',
    marginHorizontal: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: 1, backgroundColor: colors.border },
  statValue: { color: colors.text, fontSize: font.xl, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: font.xs },
  starsRow: { flexDirection: 'row', gap: 2 },
  xpBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.gold + '22', borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: colors.gold + '55',
  },
  xpText: { color: colors.gold, fontSize: font.xs, fontWeight: '800', letterSpacing: 0.5 },
  roleSmBadge: {
    borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, marginTop: 2,
  },
  roleSmText: { fontSize: font.xs, fontWeight: '800', letterSpacing: 0.3 },

  // Sections
  section: { width: '100%', marginBottom: spacing.sm, paddingHorizontal: spacing.lg },
  sectionTitle: {
    color: colors.textMuted, fontSize: font.xs, fontWeight: '800',
    letterSpacing: 1.5, textTransform: 'uppercase',
    marginBottom: spacing.xs, paddingHorizontal: spacing.xs,
  },
  sectionCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.md, padding: spacing.md,
    paddingVertical: 15,
  },
  menuIconWrap: {
    width: 40, height: 40, borderRadius: radius.md + 2,
    alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: { flex: 1, color: colors.text, fontSize: font.md, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 72 },

  // Seller CTA — bolder, more enticing
  sellerCta: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.gold + '16',
    borderRadius: radius.xl, borderWidth: 2, borderColor: colors.gold + '55',
    padding: spacing.md,
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
  },
  sellerCtaIcon: {
    width: 48, height: 48, borderRadius: radius.lg,
    backgroundColor: colors.gold + '28',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.gold + '55',
  },
  sellerCtaTitle: { color: colors.gold, fontWeight: '900', fontSize: font.base, letterSpacing: -0.2 },
  sellerCtaSub: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },

  // App status
  appRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  appIconWrap: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  appText: { fontWeight: '700', fontSize: font.md },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.error + '44',
    backgroundColor: colors.error + '0A',
  },
  logoutText: { color: colors.error, fontSize: font.base, fontWeight: '700' },
});
