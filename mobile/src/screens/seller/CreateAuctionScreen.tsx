import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, Image, ActionSheetIOS, Modal, FlatList,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { auctionsApi } from '../../api/auctions';
import { templatesApi } from '../../api/templates';
import { scanCardImage } from '../../api/cards';
import { searchCards, GameType, CardResult } from '../../services/cardSearch';
import { uploadImage } from '../../services/cloudinary';
import { AuctionGame, AuctionTemplate, CreateAuctionItemPayload } from '../../types';
import { colors, spacing, radius, font } from '../../theme';
import { authStyles } from '../../theme/authStyles';
import { formatMXN } from '../../utils/currency';
import DateTimePicker from '../../components/DateTimePicker';
import { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'CreateAuction'>;

type Condition = 'mint' | 'near_mint' | 'excellent' | 'good' | 'played';

const CONDITIONS: { value: Condition; label: string }[] = [
  { value: 'mint', label: 'Mint' },
  { value: 'near_mint', label: 'NM' },
  { value: 'excellent', label: 'EX' },
  { value: 'good', label: 'Good' },
  { value: 'played', label: 'Played' },
];

const GAMES: { value: GameType; label: string }[] = [
  { value: 'pokemon', label: 'Pokémon' },
  { value: 'mtg',     label: 'Magic' },
  { value: 'yugioh',  label: 'Yu-Gi-Oh' },
  { value: 'other',   label: 'Otro' },
];

const AUCTION_GAMES: { value: AuctionGame; label: string; emoji: string }[] = [
  { value: 'pokemon',  label: 'Pokémon',   emoji: '⚡' },
  { value: 'mtg',      label: 'MTG',       emoji: '🔮' },
  { value: 'yugioh',   label: 'Yu-Gi-Oh',  emoji: '👁️' },
  { value: 'onepiece', label: 'One Piece', emoji: '🏴‍☠️' },
  { value: 'lorcana',  label: 'Lorcana',   emoji: '✨' },
  { value: 'other',    label: 'Otros',     emoji: '🎮' },
];

const MXN_PER_USD = 17.5;

interface ItemForm {
  game: GameType;
  cardName: string;
  cardSet: string;
  cardNumber: string;
  condition: Condition;
  startingPrice: string;
  reservePrice: string;
  marketPriceUSD?: number;
  imageUris: string[];
  autoRelist: boolean;
}

const EMPTY_ITEM: ItemForm = {
  game: 'pokemon',
  cardName: '', cardSet: '', cardNumber: '',
  condition: 'near_mint', startingPrice: '', reservePrice: '',
  imageUris: [], autoRelist: false,
};

function formatDate(d: Date): string {
  const days  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${hh}:${mm}`;
}

export default function CreateAuctionScreen({ navigation }: Props) {
  const [title, setTitle]           = useState('');
  const [auctionGame, setAuctionGame] = useState<AuctionGame>('pokemon');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [items, setItems]           = useState<CreateAuctionItemPayload[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm]         = useState<ItemForm>(EMPTY_ITEM);
  const [searchResults, setSearchResults] = useState<CardResult[]>([]);
  const [searching, setSearching]         = useState(false);
  const [scanning, setScanning]           = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates]         = useState<AuctionTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openTemplates = async () => {
    setShowTemplates(true);
    setLoadingTemplates(true);
    try {
      const { data } = await templatesApi.mine();
      setTemplates(data);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los templates');
      setShowTemplates(false);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const applyTemplate = (tpl: AuctionTemplate) => {
    setAuctionGame(tpl.game);
    if (tpl.description) setDescription(tpl.description);
    setTitle(tpl.title);
    setItems(tpl.items.map(i => ({
      cardName:      i.cardName,
      cardSet:       i.cardSet,
      cardNumber:    i.cardNumber,
      condition:     (i.condition as any) ?? 'near_mint',
      startingPrice: i.startingPrice,
      reservePrice:  i.reservePrice,
      imageUrls:     i.imageUrls,
    })));
    setShowTemplates(false);
  };

  const pickImages = async () => {
    const remaining = 5 - itemForm.imageUris.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.75,
    });
    if (!result.canceled) {
      const uris = result.assets.map(a => a.uri);
      setItemForm(p => ({ ...p, imageUris: [...p.imageUris, ...uris].slice(0, 5) }));
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Activa el acceso a la cámara en configuración');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.75 });
    if (!result.canceled) {
      setItemForm(p => ({ ...p, imageUris: [...p.imageUris, result.assets[0].uri].slice(0, 5) }));
    }
  };

  const scanCard = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Activa el acceso a la cámara en configuración');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true });
    if (result.canceled || !result.assets[0].base64) return;

    setScanning(true);
    try {
      const asset = result.assets[0];
      const scan = await scanCardImage(asset.base64!, asset.mimeType ?? 'image/jpeg');
      if (!scan.cardName) {
        Alert.alert('No encontrada', 'No se pudo identificar la carta. Intenta con mejor iluminación.');
        return;
      }
      const game = scan.game === 'other' ? itemForm.game : scan.game;
      setItemForm(p => ({ ...p, game, cardName: scan.cardName, cardSet: scan.cardSet, cardNumber: scan.cardNumber }));
      setSearchResults([]);

      if (game !== 'other') {
        setSearching(true);
        const results = await searchCards(game, scan.cardName);
        if (results.length === 1) {
          selectCard(results[0]);
        } else {
          setSearchResults(results);
        }
        setSearching(false);
      }
    } catch {
      Alert.alert('Error', 'No se pudo escanear la carta');
    } finally {
      setScanning(false);
    }
  };

  const promptImageSource = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancelar', 'Galería', 'Cámara'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) pickImages(); else if (i === 2) takePhoto(); },
      );
    } else {
      Alert.alert('Agregar foto', '', [
        { text: 'Galería', onPress: pickImages },
        { text: 'Cámara', onPress: takePhoto },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    }
  };

  const updateItemField = <K extends keyof ItemForm>(key: K, value: ItemForm[K]) =>
    setItemForm(p => ({ ...p, [key]: value }));

  const handleCardNameChange = (text: string) => {
    updateItemField('cardName', text);
    updateItemField('marketPriceUSD', undefined);
    setSearchResults([]);

    if (itemForm.game === 'other') return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) return;

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchCards(itemForm.game, text.trim());
      setSearchResults(results);
      setSearching(false);
    }, 400);
  };

  const selectCard = (card: CardResult) => {
    setItemForm(p => ({
      ...p,
      cardName:      card.name,
      cardSet:       card.set,
      cardNumber:    card.number,
      marketPriceUSD: card.marketPriceUSD,
    }));
    setSearchResults([]);
  };

  const changeGame = (game: GameType) => {
    setItemForm(p => ({ ...p, game, cardName: '', cardSet: '', cardNumber: '', marketPriceUSD: undefined }));
    setSearchResults([]);
  };

  const addItem = async () => {
    const price = Math.round(parseFloat(itemForm.startingPrice) * 100);
    if (!itemForm.cardName.trim()) {
      Alert.alert('Error', 'El nombre de la carta es obligatorio');
      return;
    }
    if (isNaN(price) || price < 1) {
      Alert.alert('Error', 'Ingresa un precio inicial válido');
      return;
    }
    const reserveCents = itemForm.reservePrice
      ? Math.round(parseFloat(itemForm.reservePrice) * 100)
      : undefined;

    let imageUrls: string[] | undefined;
    if (itemForm.imageUris.length > 0) {
      setUploading(true);
      try {
        imageUrls = await Promise.all(itemForm.imageUris.map(uploadImage));
      } catch {
        Alert.alert('Error', 'No se pudieron subir las fotos. Intenta de nuevo.');
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    setItems(prev => [...prev, {
      cardName:      itemForm.cardName.trim(),
      cardSet:       itemForm.cardSet.trim() || undefined,
      cardNumber:    itemForm.cardNumber.trim() || undefined,
      condition:     itemForm.condition,
      startingPrice: price,
      reservePrice:  reserveCents && !isNaN(reserveCents) ? reserveCents : undefined,
      imageUrls,
      autoRelist: itemForm.autoRelist,
    }]);
    setItemForm(EMPTY_ITEM);
    setSearchResults([]);
    setShowItemForm(false);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'El título es obligatorio');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await auctionsApi.create({
        title: title.trim(),
        game: auctionGame,
        description: description.trim() || undefined,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
        items: items.length > 0 ? items : undefined,
      });
      navigation.replace('ManageAuction', { auctionId: data.id });
    } catch (err: any) {
      const msg = err.response?.data?.message;
      Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : (msg ?? 'No se pudo crear la subasta'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Información</Text>
          <TouchableOpacity style={styles.templateBtn} onPress={openTemplates}>
            <Ionicons name="bookmark-outline" size={14} color={colors.primaryLight} />
            <Text style={styles.templateBtnText}>Usar template</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={authStyles.input}
          placeholder="Título de la subasta *"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />
        <View style={styles.gap} />

        {/* Auction-level game category */}
        <Text style={styles.fieldLabel}>Juego</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
          <View style={styles.gameRow}>
            {AUCTION_GAMES.map(g => (
              <TouchableOpacity
                key={g.value}
                style={[styles.gameBtn, auctionGame === g.value && styles.gameBtnActive]}
                onPress={() => setAuctionGame(g.value)}
              >
                <Text style={styles.gameBtnEmoji}>{g.emoji}</Text>
                <Text style={[styles.gameBtnText, auctionGame === g.value && styles.gameBtnTextActive]}>
                  {g.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <TextInput
          style={[authStyles.input, styles.multiline]}
          placeholder="Descripción (opcional)"
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />
        <View style={styles.gap} />

        {/* Date picker */}
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar-outline" size={18} color={scheduledAt ? colors.primaryLight : colors.textMuted} />
          <Text style={[styles.dateBtnText, !scheduledAt && styles.datePlaceholder]}>
            {scheduledAt ? formatDate(scheduledAt) : 'Sin fecha programada'}
          </Text>
          {scheduledAt && (
            <TouchableOpacity
              onPress={() => setScheduledAt(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {/* Cards section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Cartas ({items.length})</Text>
          {!showItemForm && (
            <TouchableOpacity onPress={() => setShowItemForm(true)} style={styles.addBtn}>
              <Ionicons name="add" size={16} color={colors.primaryLight} />
              <Text style={styles.addBtnText}>Agregar carta</Text>
            </TouchableOpacity>
          )}
        </View>

        {items.map((item, i) => (
          <View key={i} style={styles.itemChip}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemChipName}>{item.cardName}</Text>
              <Text style={styles.itemChipMeta}>
                {item.condition?.toUpperCase()} · {formatMXN(item.startingPrice)}
                {item.cardSet ? ` · ${item.cardSet}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setItems(p => p.filter((_, j) => j !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ))}

        {showItemForm && (
          <View style={styles.itemForm}>
            {/* Game selector */}
            <View style={styles.gameRow}>
              {GAMES.map(({ value, label }) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.gameBtn, itemForm.game === value && styles.gameBtnActive]}
                  onPress={() => changeGame(value)}
                >
                  <Text style={[styles.gameBtnText, itemForm.game === value && styles.gameBtnTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Card name / search */}
            <View>
              <View style={styles.searchInputRow}>
                <TextInput
                  style={[authStyles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder={itemForm.game !== 'other' ? 'Buscar carta...' : 'Nombre de la carta *'}
                  placeholderTextColor={colors.textMuted}
                  value={itemForm.cardName}
                  onChangeText={handleCardNameChange}
                />
                {searching && <ActivityIndicator size="small" color={colors.primary} style={styles.searchSpinner} />}
                <TouchableOpacity
                  style={styles.scanBtn}
                  onPress={scanCard}
                  disabled={scanning}
                >
                  {scanning
                    ? <ActivityIndicator size="small" color={colors.primaryLight} />
                    : <Ionicons name="scan-outline" size={22} color={colors.primaryLight} />
                  }
                </TouchableOpacity>
              </View>

              {searchResults.length > 0 && (
                <View style={styles.dropdown}>
                  {searchResults.map(card => (
                    <TouchableOpacity
                      key={card.id}
                      style={styles.dropdownItem}
                      onPress={() => selectCard(card)}
                    >
                      {card.imageUrl ? (
                        <Image source={{ uri: card.imageUrl }} style={styles.cardThumb} resizeMode="contain" />
                      ) : (
                        <View style={[styles.cardThumb, styles.cardThumbEmpty]}>
                          <Ionicons name="image-outline" size={16} color={colors.textMuted} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dropdownName}>{card.name}</Text>
                        <Text style={styles.dropdownMeta}>
                          {card.set}{card.number ? ` · #${card.number}` : ''}
                        </Text>
                      </View>
                      {card.marketPriceUSD != null && (
                        <Text style={styles.dropdownPrice}>US${card.marketPriceUSD.toFixed(2)}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Set & Number */}
            <View style={styles.row}>
              <TextInput
                style={[authStyles.input, { flex: 1 }]}
                placeholder="Set (opcional)"
                placeholderTextColor={colors.textMuted}
                value={itemForm.cardSet}
                onChangeText={v => updateItemField('cardSet', v)}
              />
              <TextInput
                style={[authStyles.input, styles.numberInput]}
                placeholder="#"
                placeholderTextColor={colors.textMuted}
                value={itemForm.cardNumber}
                onChangeText={v => updateItemField('cardNumber', v)}
              />
            </View>

            {/* Market price reference */}
            {itemForm.marketPriceUSD != null && (
              <View style={styles.priceHint}>
                <Ionicons name="trending-up-outline" size={14} color={colors.accent} />
                <Text style={styles.priceHintText}>
                  Precio de mercado: US${itemForm.marketPriceUSD.toFixed(2)}
                  {' '}(~{formatMXN(Math.round(itemForm.marketPriceUSD * MXN_PER_USD * 100))})
                </Text>
              </View>
            )}

            {/* Images */}
            <Text style={styles.label}>Fotos de la carta (máx. 5)</Text>
            <View style={styles.imageRow}>
              {itemForm.imageUris.map((uri, i) => (
                <View key={i} style={styles.thumbWrap}>
                  <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                  <TouchableOpacity
                    style={styles.thumbRemove}
                    onPress={() => setItemForm(p => ({ ...p, imageUris: p.imageUris.filter((_, j) => j !== i) }))}
                  >
                    <Ionicons name="close-circle" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
              {itemForm.imageUris.length < 5 && (
                <TouchableOpacity style={styles.thumbAdd} onPress={promptImageSource}>
                  <Ionicons name="camera-outline" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Condition */}
            <Text style={styles.label}>Condición</Text>
            <View style={styles.conditionRow}>
              {CONDITIONS.map(({ value, label }) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.conditionBtn, itemForm.condition === value && styles.conditionBtnActive]}
                  onPress={() => updateItemField('condition', value)}
                >
                  <Text style={[styles.conditionText, itemForm.condition === value && styles.conditionTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Prices */}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Precio inicial (MXN) *</Text>
                <TextInput
                  style={authStyles.input}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  value={itemForm.startingPrice}
                  onChangeText={v => updateItemField('startingPrice', v)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Reserva (opcional)</Text>
                <TextInput
                  style={authStyles.input}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  value={itemForm.reservePrice}
                  onChangeText={v => updateItemField('reservePrice', v)}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.autoRelistRow}
              onPress={() => updateItemField('autoRelist', !itemForm.autoRelist)}
            >
              <View style={[styles.toggle, itemForm.autoRelist && styles.toggleOn]}>
                <View style={[styles.toggleThumb, itemForm.autoRelist && styles.toggleThumbOn]} />
              </View>
              <Text style={styles.autoRelistLabel}>Auto-relist si no se vende</Text>
            </TouchableOpacity>

            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.formBtn, styles.formBtnCancel]}
                onPress={() => { setShowItemForm(false); setItemForm(EMPTY_ITEM); setSearchResults([]); setUploading(false); }}
              >
                <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.formBtn, styles.formBtnConfirm, uploading && { opacity: 0.6 }]} onPress={addItem} disabled={uploading}>
                {uploading
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={{ color: colors.white, fontWeight: '700' }}>Agregar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[authStyles.button, submitting && authStyles.buttonDisabled, styles.submitBtn]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color={colors.white} />
            : <Text style={authStyles.buttonText}>Crear Subasta</Text>
          }
        </TouchableOpacity>
      </ScrollView>

      <DateTimePicker
        visible={showDatePicker}
        value={scheduledAt}
        onConfirm={date => { setScheduledAt(date); setShowDatePicker(false); }}
        onCancel={() => setShowDatePicker(false)}
      />

      <Modal visible={showTemplates} transparent animationType="slide" onRequestClose={() => setShowTemplates(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mis Templates</Text>
              <TouchableOpacity onPress={() => setShowTemplates(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            {loadingTemplates ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
            ) : templates.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Text style={styles.modalEmptyText}>No tienes templates guardados aún.</Text>
                <Text style={styles.modalEmptyHint}>Guarda uno desde una subasta terminada.</Text>
              </View>
            ) : (
              <FlatList
                data={templates}
                keyExtractor={t => t.id}
                contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
                renderItem={({ item: tpl }) => (
                  <TouchableOpacity style={styles.tplCard} onPress={() => applyTemplate(tpl)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tplName}>{tpl.name}</Text>
                      <Text style={styles.tplMeta}>{tpl.game} · {tpl.items.length} {tpl.items.length === 1 ? 'carta' : 'cartas'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700', marginTop: spacing.xl, marginBottom: spacing.sm },
  gap: { height: spacing.sm },
  multiline: { height: 88, textAlignVertical: 'top', paddingTop: spacing.sm },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
  },
  dateBtnText: { flex: 1, color: colors.text, fontSize: font.base },
  datePlaceholder: { color: colors.textMuted },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { color: colors.primaryLight, fontSize: font.sm, fontWeight: '600' },
  itemChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.sm, marginBottom: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  itemChipName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  itemChipMeta: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  itemForm: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    gap: spacing.sm, marginBottom: spacing.sm,
  },
  gameRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  fieldLabel: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700', marginBottom: spacing.xs },
  gameBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
  },
  gameBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  gameBtnEmoji: { fontSize: 13 },
  gameBtnText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  gameBtnTextActive: { color: colors.white },
  searchInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  searchSpinner: { position: 'absolute', right: 48 },
  scanBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  dropdown: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, marginTop: 2, overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  cardThumb: { width: 36, height: 50, borderRadius: 4 },
  cardThumbEmpty: { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  dropdownName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  dropdownMeta: { color: colors.textMuted, fontSize: font.sm },
  dropdownPrice: { color: colors.accent, fontSize: font.sm, fontWeight: '700' },
  priceHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
  },
  priceHintText: { color: colors.accent, fontSize: font.sm, flex: 1 },
  row: { flexDirection: 'row', gap: spacing.sm },
  numberInput: { width: 72 },
  label: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600', marginBottom: 4 },
  conditionRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  conditionBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
  },
  conditionBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  conditionText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  conditionTextActive: { color: colors.white },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: { position: 'relative' },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  thumbRemove: { position: 'absolute', top: -6, right: -6 },
  thumbAdd: {
    width: 64, height: 64, borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center',
  },
  formBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  formBtnCancel: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  formBtnConfirm: { backgroundColor: colors.primary },
  submitBtn: { marginTop: spacing.xxl },
  templateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  templateBtnText: { color: colors.primaryLight, fontSize: font.sm, fontWeight: '600' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  modalEmpty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  modalEmptyText: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  modalEmptyHint: { color: colors.textMuted, fontSize: font.sm },
  tplCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  tplName: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  tplMeta: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  autoRelistRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  autoRelistLabel: { color: colors.text, fontSize: font.md, flex: 1 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: colors.border, justifyContent: 'center', paddingHorizontal: 2 },
  toggleOn: { backgroundColor: colors.primary },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: 'flex-start' },
  toggleThumbOn: { alignSelf: 'flex-end' },
});
