import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { sellerDocumentsApi, SellerDocument, DocumentType, DocumentStatus } from '../../api/sellerDocuments';
import { colors, spacing, radius, font } from '../../theme';
import { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'SellerDocuments'>;

interface DocConfig {
  type: DocumentType;
  label: string;
  description: string;
  validity: string;
  needsDate: boolean;
  icon: keyof typeof Ionicons.glyphMap;
}

const DOC_CONFIGS: DocConfig[] = [
  { type: 'curp',                  label: 'CURP',                        description: 'Clave Única de Registro de Población',  validity: 'Sin vigencia',   needsDate: false, icon: 'person-circle-outline' },
  { type: 'constancia_fiscal',     label: 'Constancia Fiscal',           description: 'Constancia de situación fiscal del SAT', validity: 'Mensual',        needsDate: true,  icon: 'document-text-outline' },
  { type: 'opinion_cumplimiento',  label: 'Opinión de Cumplimiento',     description: 'Opinión de cumplimiento del SAT',        validity: 'Mensual',        needsDate: true,  icon: 'checkmark-done-outline' },
  { type: 'comprobante_domicilio', label: 'Comprobante de Domicilio',    description: 'No mayor a 3 meses de emisión',          validity: 'Máx. 3 meses',   needsDate: true,  icon: 'home-outline' },
  { type: 'identificacion',        label: 'INE o Pasaporte',             description: 'Identificación oficial vigente',         validity: 'Sin vigencia',   needsDate: false, icon: 'card-outline' },
  { type: 'cuenta_bancaria',       label: 'Cuenta Bancaria',             description: 'Estado de cuenta o CLABE interbancaria', validity: 'Sin vigencia',   needsDate: false, icon: 'cash-outline' },
];

const STATUS_CONFIG: Record<DocumentStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending:  { label: 'En revisión', color: colors.warning, icon: 'time-outline' },
  approved: { label: 'Aprobado',    color: colors.success, icon: 'checkmark-circle-outline' },
  rejected: { label: 'Rechazado',   color: colors.error,   icon: 'close-circle-outline' },
};

export default function SellerDocumentsScreen({}: Props) {
  const [documents, setDocuments] = useState<SellerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState<DocumentType | null>(null);

  // Date modal state
  const [dateModal, setDateModal] = useState<{ type: DocumentType; label: string } | null>(null);
  const [dateInput, setDateInput] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await sellerDocumentsApi.getMyDocuments();
      setDocuments(data);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los documentos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getDoc = (type: DocumentType) => documents.find(d => d.documentType === type);

  const pickAndUpload = async (config: DocConfig, emissionDate?: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    const filename = uri.split('/').pop() ?? 'document.jpg';
    const type = asset.mimeType ?? 'image/jpeg';

    setUploading(config.type);
    try {
      const formData = new FormData();
      formData.append('file', { uri, name: filename, type } as any);
      formData.append('documentType', config.type);
      if (emissionDate) formData.append('emissionDate', emissionDate);

      await sellerDocumentsApi.upload(formData);
      await load(true);
      Alert.alert('Enviado', 'Tu documento fue enviado para revisión');
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'No se pudo subir el documento';
      Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setUploading(null);
    }
  };

  const handleUploadPress = (config: DocConfig) => {
    if (uploading) return;
    if (config.needsDate) {
      setDateInput('');
      setDateModal({ type: config.type, label: config.label });
    } else {
      pickAndUpload(config);
    }
  };

  const confirmDate = () => {
    if (!dateModal) return;
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(dateInput);
    if (!iso) {
      Alert.alert('Formato inválido', 'Ingresa la fecha como AAAA-MM-DD (ej. 2025-05-01)');
      return;
    }
    const config = DOC_CONFIGS.find(c => c.type === dateModal.type)!;
    setDateModal(null);
    pickAndUpload(config, dateInput);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
      >
        <Text style={styles.intro}>
          Estos documentos son necesarios para poder recibir pagos como vendedor. El equipo de TCG Live los revisará en 1–2 días hábiles.
        </Text>

        {DOC_CONFIGS.map(config => {
          const doc = getDoc(config.type);
          const busy = uploading === config.type;
          const statusCfg = doc ? STATUS_CONFIG[doc.status] : null;

          return (
            <View key={config.type} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconWrap}>
                  <Ionicons name={config.icon} size={22} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{config.label}</Text>
                  <Text style={styles.cardDesc}>{config.description}</Text>
                </View>
                <View style={[styles.validityBadge, config.validity === 'Mensual' && styles.validityBadgeRed]}>
                  <Text style={styles.validityText}>{config.validity}</Text>
                </View>
              </View>

              {doc ? (
                <View style={styles.cardFooter}>
                  <View style={styles.statusRow}>
                    <Ionicons name={statusCfg!.icon} size={16} color={statusCfg!.color} />
                    <Text style={[styles.statusText, { color: statusCfg!.color }]}>{statusCfg!.label}</Text>
                    {doc.emissionDate ? (
                      <Text style={styles.dateText}>· {doc.emissionDate}</Text>
                    ) : null}
                  </View>
                  {doc.rejectionNote ? (
                    <Text style={styles.rejectionNote}>{doc.rejectionNote}</Text>
                  ) : null}
                  {doc.status !== 'pending' && (
                    <TouchableOpacity
                      style={styles.updateBtn}
                      onPress={() => handleUploadPress(config)}
                      disabled={busy}
                    >
                      {busy
                        ? <ActivityIndicator size="small" color={colors.accent} />
                        : <Text style={styles.updateBtnText}>Actualizar</Text>
                      }
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.uploadBtn}
                  onPress={() => handleUploadPress(config)}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={16} color={colors.white} />
                      <Text style={styles.uploadBtnText}>Subir documento</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Date input modal */}
      <Modal visible={!!dateModal} transparent animationType="fade" onRequestClose={() => setDateModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Fecha de emisión</Text>
            <Text style={styles.modalSubtitle}>{dateModal?.label}</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="AAAA-MM-DD"
              placeholderTextColor={colors.textMuted}
              value={dateInput}
              onChangeText={setDateInput}
              keyboardType="numeric"
              maxLength={10}
              autoFocus
            />
            <Text style={styles.modalHint}>
              {dateModal?.type === 'comprobante_domicilio'
                ? 'El documento no puede tener más de 3 meses de antigüedad.'
                : 'El documento debe ser del mes en curso.'}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setDateModal(null)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={confirmDate}>
                <Text style={styles.modalConfirmText}>Continuar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  intro: { color: colors.textMuted, fontSize: font.sm, lineHeight: 20, marginBottom: spacing.xs },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, gap: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  iconWrap: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.accent + '1A',
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  cardDesc: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  validityBadge: {
    backgroundColor: colors.success + '22',
    paddingHorizontal: spacing.xs, paddingVertical: 2,
    borderRadius: radius.sm,
  },
  validityBadgeRed: { backgroundColor: colors.warning + '22' },
  validityText: { color: colors.textMuted, fontSize: font.xs, fontWeight: '700' },

  cardFooter: { gap: spacing.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusText: { fontSize: font.sm, fontWeight: '700' },
  dateText: { color: colors.textMuted, fontSize: font.sm },
  rejectionNote: {
    color: colors.error, fontSize: font.sm, backgroundColor: colors.error + '15',
    borderRadius: radius.sm, padding: spacing.sm,
  },
  updateBtn: {
    alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.accent,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  updateBtnText: { color: colors.accent, fontSize: font.sm, fontWeight: '700' },

  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: spacing.sm,
  },
  uploadBtnText: { color: colors.white, fontSize: font.sm, fontWeight: '700' },

  // Modal
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.xl,
  },
  modalCard: {
    width: '100%', backgroundColor: colors.surface,
    borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  modalTitle: { color: colors.text, fontSize: font.lg, fontWeight: '800' },
  modalSubtitle: { color: colors.textMuted, fontSize: font.sm, marginTop: -spacing.xs },
  dateInput: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    color: colors.text, fontSize: font.base,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    letterSpacing: 1,
  },
  modalHint: { color: colors.textMuted, fontSize: font.sm },
  modalActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  modalCancel: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  modalCancelText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700' },
  modalConfirm: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.lg, backgroundColor: colors.primary,
  },
  modalConfirmText: { color: colors.white, fontSize: font.sm, fontWeight: '700' },
});
