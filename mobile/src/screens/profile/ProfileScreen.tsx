import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth.store';
import { sellerApplicationsApi } from '../../api/seller-applications';
import { SellerApplication, ApplicationStatus } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ProfileHome'>;

const STATUS_LABEL: Record<ApplicationStatus, { label: string; color: string }> = {
  pending:  { label: 'Solicitud en revisión', color: colors.warning },
  approved: { label: 'Vendedor aprobado',     color: colors.success },
  rejected: { label: 'Solicitud rechazada',   color: colors.error },
};

export default function ProfileScreen({ navigation }: Props) {
  const { user, logout } = useAuthStore();
  const [application, setApplication] = useState<SellerApplication | null>(null);
  const [loadingApp, setLoadingApp] = useState(false);

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
    if (user?.role === 'admin')  return { label: 'Admin',    color: colors.error };
    if (user?.role === 'seller') return { label: 'Vendedor', color: colors.success };
    return { label: 'Comprador', color: colors.textMuted };
  };

  const badge = roleBadge();

  return (
    <View style={styles.container}>
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user?.username?.[0]?.toUpperCase() ?? '?'}</Text>
      </View>

      <View style={styles.nameRow}>
        <Text style={styles.username}>@{user?.username}</Text>
        <View style={[styles.roleBadge, { backgroundColor: badge.color + '22', borderColor: badge.color }]}>
          <Text style={[styles.roleText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>
      <Text style={styles.email}>{user?.email}</Text>

      {/* Stats */}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>${((user?.balance ?? 0) / 100).toFixed(2)}</Text>
          <Text style={styles.statLabel}>Saldo MXN</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{user?.reputationScore ?? 0}</Text>
          <Text style={styles.statLabel}>Reputación</Text>
        </View>
      </View>

      {/* Seller application status / CTA */}
      {user?.role === 'buyer' && (
        <View style={styles.section}>
          {loadingApp ? (
            <ActivityIndicator color={colors.primary} />
          ) : application ? (
            <View style={styles.appStatus}>
              <Ionicons
                name={application.status === 'pending' ? 'time-outline' : application.status === 'approved' ? 'checkmark-circle-outline' : 'close-circle-outline'}
                size={20}
                color={STATUS_LABEL[application.status].color}
              />
              <Text style={[styles.appStatusText, { color: STATUS_LABEL[application.status].color }]}>
                {STATUS_LABEL[application.status].label}
              </Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.sellerBtn} onPress={() => navigation.navigate('ApplySeller')}>
              <Ionicons name="storefront-outline" size={18} color={colors.primaryLight} />
              <Text style={styles.sellerBtnText}>Solicitar ser vendedor</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {user?.role === 'buyer' && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.sellerBtn} onPress={() => navigation.navigate('MyOrders')}>
            <Ionicons name="receipt-outline" size={18} color={colors.primaryLight} />
            <Text style={styles.sellerBtnText}>Mis Compras</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <TouchableOpacity style={styles.sellerBtn} onPress={() => navigation.navigate('PaymentMethods')}>
          <Ionicons name="card-outline" size={18} color={colors.primaryLight} />
          <Text style={styles.sellerBtnText}>Formas de Pago</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.sectionDivider} />
        <TouchableOpacity style={styles.sellerBtn} onPress={() => navigation.navigate('AddressSettings')}>
          <Ionicons name="location-outline" size={18} color={colors.primaryLight} />
          <Text style={styles.sellerBtnText}>
            Mi Dirección{user?.zipCode ? ` · CP ${user.zipCode}` : ''}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {(user?.role === 'seller' || user?.role === 'admin') && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.sellerBtn} onPress={() => navigation.navigate('SellerDashboard')}>
            <Ionicons name="albums-outline" size={18} color={colors.primaryLight} />
            <Text style={styles.sellerBtnText}>Mis Subastas</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <View style={styles.sectionDivider} />
          <TouchableOpacity style={styles.sellerBtn} onPress={() => navigation.navigate('ShippingSettings')}>
            <Ionicons name="cube-outline" size={18} color={colors.primaryLight} />
            <Text style={styles.sellerBtnText}>Configurar Envíos</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {user?.role === 'admin' && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.sellerBtn} onPress={() => navigation.navigate('AdminApplications')}>
            <Ionicons name="people-outline" size={18} color={colors.accent} />
            <Text style={[styles.sellerBtnText, { color: colors.accent }]}>Solicitudes de vendedores</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={colors.error} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.lg },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
  avatarText: { color: colors.white, fontSize: 32, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  username: { color: colors.text, fontSize: font.xl, fontWeight: '700' },
  roleBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1 },
  roleText: { fontSize: font.sm, fontWeight: '700' },
  email: { color: colors.textMuted, fontSize: font.md, marginBottom: spacing.xl },
  stats: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl, gap: spacing.xl, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl },
  stat: { alignItems: 'center' },
  statValue: { color: colors.text, fontSize: font.xl, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  divider: { width: 1, backgroundColor: colors.border },
  section: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.md },
  sellerBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  sellerBtnText: { flex: 1, color: colors.primaryLight, fontSize: font.md, fontWeight: '600' },
  appStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  appStatusText: { fontSize: font.md, fontWeight: '600' },
  sectionDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md },
  logoutText: { color: colors.error, fontSize: font.base, fontWeight: '600' },
});
