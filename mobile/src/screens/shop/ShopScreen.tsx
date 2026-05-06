import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, ScrollView, Modal, KeyboardAvoidingView,
  Platform, Alert, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { listingsApi, Listing, CreateListingDto } from '../../api/listings';
import { useAuthStore } from '../../store/auth.store';
import { formatMXN } from '../../utils/currency';
import { colors, spacing, radius, font } from '../../theme';
import { GAME_COLORS, GameKey, ALL_GAME_COLOR } from '../../theme/gameColors';
import { ShopStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ShopStackParamList, 'ShopList'>;

const PLATFORM_FEE = 0.08;

function timeAgo(dateString: string): string {
  const secs = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (secs < 60) return 'ahora';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}sem`;
}

const GAMES = [
  { value: null,       label: 'Todo',      emoji: '🃏' },
  { value: 'pokemon',  label: 'Pokémon',   emoji: '⚡' },
  { value: 'mtg',      label: 'MTG',       emoji: '🔮' },
  { value: 'yugioh',   label: 'Yu-Gi-Oh',  emoji: '👁' },
  { value: 'onepiece', label: 'One Piece', emoji: '⚓' },
  { value: 'lorcana',  label: 'Lorcana',   emoji: '✨' },
  { value: 'other',    label: 'Otros',     emoji: '🎮' },
];

const CONDITIONS: Record<string, string> = {
  mint: 'Mint', near_mint: 'NM', excellent: 'EX',
  good: 'Good', played: 'Played',
};

const CONDITION_OPTIONS = ['mint', 'near_mint', 'excellent', 'good', 'played'];

const CONDITION_COLORS: Record<string, string> = {
  mint:      colors.success,
  near_mint: '#34d399',
  excellent: colors.accent,
  good:      colors.warning,
  played:    colors.textMuted,
};

function ShopHeader({ searchValue, onSearch }: { searchValue: string; onSearch: (t: string) => void }) {
  return (
    <View style={styles.appHeader}>
      <View style={styles.brandRow}>
        <View style={styles.brandGlow} />
        <Text style={styles.brandText}>TCG<Text style={styles.brandAccent}> LIVE</Text></Text>
        <View style={styles.brandDot} />
        <View style={{ flex: 1 }} />
        <View style={styles.storeBadge}>
          <Ionicons name="storefront" size={13} color={colors.accent} />
          <Text style={styles.storeBadgeText}>Tienda</Text>
        </View>
      </View>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={searchValue}
          onChangeText={onSearch}
          placeholder="Buscar cartas o artículos..."
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
    </View>
  );
}

function GameChips({ selected, onSelect }: { selected: string | null; onSelect: (g: string | null) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipsScroll}
      contentContainerStyle={styles.chipsContent}
    >
      {GAMES.map(g => {
        const active = g.value === selected;
        const gc = g.value ? (GAME_COLORS[g.value as GameKey] ?? ALL_GAME_COLOR) : ALL_GAME_COLOR;
        return (
          <TouchableOpacity
            key={g.value ?? 'all'}
            style={[
              styles.chip,
              active && { backgroundColor: gc.bg, borderColor: gc.bg, shadowColor: gc.bg, shadowOpacity: 0.45, shadowRadius: 6, elevation: 4 },
            ]}
            onPress={() => onSelect(g.value)}
            activeOpacity={0.75}
          >
            <Text style={styles.chipEmoji}>{g.emoji}</Text>
            <Text style={[styles.chipLabel, active && { color: gc.text, fontWeight: '800' }]}>{g.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function ListingCard({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  const gameMeta = GAMES.find(g => g.value === listing.game);
  const gc = listing.game ? (GAME_COLORS[listing.game as GameKey] ?? { bg: colors.border, text: '#fff' }) : { bg: colors.border, text: '#fff' };
  const condColor = listing.condition ? (CONDITION_COLORS[listing.condition] ?? colors.textMuted) : null;
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, friction: 8, tension: 160 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 140 }).start();

  return (
    <Animated.View style={[{ transform: [{ scale }] }, { flex: 1 }]}>
      <TouchableOpacity style={styles.card} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} activeOpacity={1}>

        {/* Image / art area with game gradient background */}
        <View style={[styles.cardImageArea, { backgroundColor: gc.bg + '18' }]}>
          {/* Bottom-left game stripe accent */}
          <View style={[styles.cardImageStripe, { backgroundColor: gc.bg }]} />

          {/* Central emoji art */}
          <View style={[styles.cardEmojiWrap, { backgroundColor: gc.bg + '28', borderColor: gc.bg + '55' }]}>
            <Text style={styles.cardEmoji}>{gameMeta?.emoji ?? '🃏'}</Text>
          </View>

          {/* Condition badge — top right */}
          {listing.condition && condColor && (
            <View style={[styles.condBadge, { backgroundColor: condColor + '28', borderColor: condColor + '66' }]}>
              <View style={[styles.condDot, { backgroundColor: condColor }]} />
              <Text style={[styles.condText, { color: condColor }]}>{CONDITIONS[listing.condition] ?? listing.condition}</Text>
            </View>
          )}

          {/* "Comprar ahora" buy-now hint overlay */}
          <View style={styles.buyNowHint}>
            <Ionicons name="cart-outline" size={10} color={colors.accent} />
            <Text style={styles.buyNowHintText}>Precio fijo</Text>
          </View>
        </View>

        {/* Card body */}
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={2}>{listing.title}</Text>
          <View style={styles.sellerRow}>
            <Ionicons name="person-circle-outline" size={11} color={colors.textMuted} />
            <Text style={styles.sellerText} numberOfLines={1}>@{listing.seller?.username}</Text>
            {listing.seller?.isVerified && (
              <Ionicons name="checkmark-circle" size={11} color="#3b82f6" />
            )}
          </View>
        </View>

        {/* Price footer */}
        <View style={styles.cardFooter}>
          <Text style={styles.price}>{formatMXN(listing.price)}</Text>
          <View style={styles.timeAgoWrap}>
            <Ionicons name="time-outline" size={9} color={colors.textMuted + '88'} />
            <Text style={styles.timeAgo}>{timeAgo(listing.createdAt)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ShopScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [game, setGame] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [showOffer, setShowOffer] = useState(false);
  const [offerAmountText, setOfferAmountText] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [offerBusy, setOfferBusy] = useState(false);

  const [form, setForm] = useState<CreateListingDto & { condition: string; game: string }>({
    title: '', description: '', price: 0, game: '', condition: '',
  });
  const [priceText, setPriceText] = useState('');

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (currentGame = game, currentQ = q) => {
    try {
      const { data } = await listingsApi.list(currentGame ?? undefined, currentQ || undefined);
      setListings(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [game, q]);

  useEffect(() => { load(); }, [game]);

  const handleSearch = (text: string) => {
    setQ(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(game, text), 400);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) { Alert.alert('Error', 'El título es obligatorio'); return; }
    if (!form.price || form.price < 100) { Alert.alert('Error', 'El precio mínimo es $1.00'); return; }
    setCreating(true);
    try {
      await listingsApi.create({
        title: form.title.trim(),
        description: form.description?.trim() || undefined,
        price: form.price,
        game: form.game || undefined,
        condition: form.condition || undefined,
      });
      setShowCreate(false);
      setForm({ title: '', description: '', price: 0, game: '', condition: '' });
      setPriceText('');
      load();
    } catch {
      Alert.alert('Error', 'No se pudo publicar el artículo');
    } finally {
      setCreating(false);
    }
  };

  const handleMakeOffer = async () => {
    if (!selectedListing) return;
    const cents = Math.round(parseFloat(offerAmountText) * 100);
    if (isNaN(cents) || cents < 100) { Alert.alert('Error', 'Ingresa un monto válido (mín. $1.00)'); return; }
    if (cents >= selectedListing.price) {
      Alert.alert('Tip', 'Tu oferta es igual o mayor al precio. Puedes comprar directo.');
      return;
    }
    setOfferBusy(true);
    try {
      await listingsApi.createOffer(selectedListing.id, cents, offerMessage.trim() || undefined);
      setShowOffer(false);
      setSelectedListing(null);
      setOfferAmountText('');
      setOfferMessage('');
      Alert.alert('Oferta enviada', 'El vendedor la revisará y te responderá.');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message ?? 'No se pudo enviar la oferta');
    } finally {
      setOfferBusy(false);
    }
  };

  const isSeller = user?.role === 'seller' || user?.role === 'admin';
  const takeHome = form.price > 0 ? Math.round(form.price * (1 - PLATFORM_FEE)) : 0;

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ShopHeader searchValue={q} onSearch={handleSearch} />
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ShopHeader searchValue={q} onSearch={handleSearch} />
      <GameChips selected={game} onSelect={setGame} />

      <FlatList
        data={listings}
        keyExtractor={l => l.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        removeClippedSubviews
        maxToRenderPerBatch={8}
        windowSize={7}
        initialNumToRender={8}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="cart-outline" size={44} color={colors.accent + '88'} />
            </View>
            <Text style={styles.emptyTitle}>Tienda vacía</Text>
            <Text style={styles.emptyText}>No hay artículos para estos filtros.</Text>
            <Text style={styles.emptySubtext}>
              {isSeller ? 'Publica tu primera carta con el botón +' : 'Vuelve pronto — los vendedores actualizan seguido'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ListingCard listing={item} onPress={() => setSelectedListing(item)} />
        )}
      />

      {isSeller && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={28} color={colors.white} />
        </TouchableOpacity>
      )}

      {/* Listing detail modal */}
      <Modal visible={!!selectedListing && !showOffer} transparent animationType="slide" onRequestClose={() => setSelectedListing(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedListing(null)}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            {selectedListing && (() => {
              const gc2 = selectedListing.game
                ? (GAME_COLORS[selectedListing.game as GameKey] ?? { bg: colors.border, text: '#fff' })
                : { bg: colors.border, text: '#fff' };
              const gameMeta2 = GAMES.find(g => g.value === selectedListing.game);
              const condColor2 = selectedListing.condition ? (CONDITION_COLORS[selectedListing.condition] ?? colors.textMuted) : null;
              return (
                <>
                  {/* Game color accent bar at top */}
                  <View style={[styles.modalGameBar, { backgroundColor: gc2.bg }]} />

                  <Text style={styles.modalTitle}>{selectedListing.title}</Text>

                  {/* Price row */}
                  <View style={styles.modalPriceRow}>
                    <Text style={styles.modalPrice}>{formatMXN(selectedListing.price)}</Text>
                    <View style={styles.modalBadges}>
                      {condColor2 && selectedListing.condition && (
                        <View style={[styles.condBadgeLg, { backgroundColor: condColor2 + '22', borderColor: condColor2 + '55' }]}>
                          <View style={[styles.condDot, { backgroundColor: condColor2, width: 6, height: 6 }]} />
                          <Text style={[styles.condTextLg, { color: condColor2 }]}>
                            {CONDITIONS[selectedListing.condition] ?? selectedListing.condition}
                          </Text>
                        </View>
                      )}
                      {selectedListing.game && gameMeta2 && (
                        <View style={[styles.gameBadgeLg, { backgroundColor: gc2.bg + '22', borderColor: gc2.bg + '55' }]}>
                          <Text style={[styles.gameBadgeLgText, { color: gc2.bg }]}>
                            {gameMeta2.emoji} {gameMeta2.label}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {selectedListing.description ? (
                    <Text style={styles.modalDesc}>{selectedListing.description}</Text>
                  ) : null}

                  {/* Seller */}
                  <View style={styles.modalSellerRow}>
                    <Ionicons name="person-circle-outline" size={16} color={colors.textMuted} />
                    <Text style={styles.modalSeller}>@{selectedListing.seller?.username}</Text>
                    {selectedListing.seller?.isVerified && (
                      <View style={styles.verifiedBadge}>
                        <Ionicons name="checkmark-circle" size={13} color="#3b82f6" />
                        <Text style={styles.verifiedText}>Verificado</Text>
                      </View>
                    )}
                    <Text style={styles.modalPosted}>· hace {timeAgo(selectedListing.createdAt)}</Text>
                  </View>

                  {/* Divider */}
                  <View style={styles.modalDivider} />

                  {/* Action buttons */}
                  {user && selectedListing.sellerId !== user.id && (
                    <TouchableOpacity style={styles.offerBtn} onPress={() => setShowOffer(true)}>
                      <Ionicons name="pricetag-outline" size={18} color={colors.primaryLight} />
                      <Text style={styles.offerBtnText}>Hacer oferta</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.contactBtn}
                    onPress={() => {
                      setSelectedListing(null);
                      (navigation as any).navigate('SellerProfile', { sellerId: selectedListing.sellerId });
                    }}
                  >
                    <Ionicons name="storefront-outline" size={18} color={colors.white} />
                    <Text style={styles.contactBtnText}>Ver vendedor</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Make Offer modal */}
      <Modal visible={showOffer} transparent animationType="slide" onRequestClose={() => setShowOffer(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowOffer(false)}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Hacer oferta</Text>
            {selectedListing && (
              <View style={styles.offerPriceHint}>
                <Ionicons name="pricetag" size={14} color={colors.gold} />
                <Text style={styles.offerPriceHintText}>
                  Precio: <Text style={{ color: colors.gold, fontWeight: '800' }}>{formatMXN(selectedListing.price)}</Text>
                </Text>
              </View>
            )}
            <TextInput
              style={styles.input}
              placeholder="Tu oferta (MXN) *"
              placeholderTextColor={colors.textMuted}
              value={offerAmountText}
              onChangeText={setOfferAmountText}
              keyboardType="decimal-pad"
              autoFocus
            />
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Mensaje al vendedor (opcional)"
              placeholderTextColor={colors.textMuted}
              value={offerMessage}
              onChangeText={setOfferMessage}
              multiline
              numberOfLines={2}
            />
            <TouchableOpacity
              style={[styles.contactBtn, offerBusy && { opacity: 0.6 }]}
              onPress={handleMakeOffer}
              disabled={offerBusy}
            >
              {offerBusy
                ? <ActivityIndicator color={colors.white} />
                : <>
                    <Ionicons name="pricetag-outline" size={18} color={colors.white} />
                    <Text style={styles.contactBtnText}>Enviar oferta</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create listing modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowCreate(false)}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Publicar artículo</Text>

            <TextInput
              style={styles.input}
              placeholder="Título *"
              placeholderTextColor={colors.textMuted}
              value={form.title}
              onChangeText={t => setForm(f => ({ ...f, title: t }))}
            />
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Descripción"
              placeholderTextColor={colors.textMuted}
              value={form.description}
              onChangeText={t => setForm(f => ({ ...f, description: t }))}
              multiline
              numberOfLines={3}
            />
            <TextInput
              style={styles.input}
              placeholder="Precio (MXN) *"
              placeholderTextColor={colors.textMuted}
              value={priceText}
              onChangeText={t => {
                setPriceText(t);
                const n = parseFloat(t);
                setForm(f => ({ ...f, price: isNaN(n) ? 0 : Math.round(n * 100) }));
              }}
              keyboardType="decimal-pad"
            />

            {takeHome > 0 && (
              <View style={styles.feeBox}>
                <Ionicons name="cash-outline" size={14} color={colors.success} />
                <Text style={styles.feeText}>
                  Recibirás aprox.{' '}
                  <Text style={{ fontWeight: '800', color: colors.success }}>{formatMXN(takeHome)}</Text>
                  {' '}(comisión del {(PLATFORM_FEE * 100).toFixed(0)}%)
                </Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Juego</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
              {GAMES.slice(1).map(g => (
                <TouchableOpacity
                  key={g.value}
                  style={[styles.chip, form.game === g.value && styles.chipActive, { marginRight: spacing.xs }]}
                  onPress={() => setForm(f => ({ ...f, game: f.game === g.value ? '' : g.value! }))}
                >
                  <Text style={styles.chipEmoji}>{g.emoji}</Text>
                  <Text style={[styles.chipLabel, form.game === g.value && styles.chipLabelActive]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Condición</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
              {CONDITION_OPTIONS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, form.condition === c && styles.chipActive, { marginRight: spacing.xs }]}
                  onPress={() => setForm(f => ({ ...f, condition: f.condition === c ? '' : c }))}
                >
                  <Text style={[styles.chipLabel, form.condition === c && styles.chipLabelActive]}>{CONDITIONS[c]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={[styles.contactBtn, creating && { opacity: 0.6 }]} onPress={handleCreate} disabled={creating}>
              {creating
                ? <ActivityIndicator color={colors.white} />
                : <>
                    <Ionicons name="cloud-upload-outline" size={18} color={colors.white} />
                    <Text style={styles.contactBtnText}>Publicar</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },

  // Branded header
  appHeader: {
    backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 4,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.sm, gap: 6 },
  brandGlow: {
    position: 'absolute', left: -8, top: 6, width: 120, height: 36,
    borderRadius: 18, backgroundColor: colors.primary + '18',
  },
  brandText: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  brandAccent: { color: colors.primaryLight },
  brandDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
  storeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.accent + '18', borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.accent + '44',
  },
  storeBadgeText: { color: colors.accent, fontSize: font.xs, fontWeight: '700' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 11,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: font.md, paddingVertical: 0 },

  chipsScroll: { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
  chipsContent: { paddingHorizontal: spacing.md, gap: 6, paddingVertical: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.surface, borderRadius: radius.full,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1.5, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primaryLight },
  chipEmoji: { fontSize: 13 },
  chipLabel: { fontSize: font.sm, color: colors.textMuted, fontWeight: '600' },
  chipLabelActive: { color: colors.white, fontWeight: '800' },

  list: { padding: spacing.md, paddingBottom: 100 },
  row: { gap: spacing.sm, marginBottom: spacing.sm },

  // Premium 2-col listing card
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  cardImageArea: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cardImageStripe: {
    position: 'absolute',
    bottom: 0, left: 0,
    width: 4, height: '100%',
  },
  cardEmojiWrap: {
    width: 72, height: 72,
    borderRadius: radius.xl,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  cardEmoji: { fontSize: 38 },
  condBadge: {
    position: 'absolute', top: spacing.xs, right: spacing.xs,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 1,
  },
  condDot: { width: 5, height: 5, borderRadius: 3 },
  condText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  buyNowHint: {
    position: 'absolute', bottom: spacing.xs, right: spacing.xs,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.surfaceAlt + 'CC',
    borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: colors.accent + '33',
  },
  buyNowHintText: { fontSize: 9, color: colors.accent, fontWeight: '700' },

  cardContent: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xs, gap: 3 },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: colors.border + '66',
  },
  cardTitle: { fontSize: font.sm, fontWeight: '700', color: colors.text, lineHeight: 18 },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sellerText: { fontSize: font.xs, color: colors.textMuted, flexShrink: 1 },
  price: { fontSize: font.md, fontWeight: '900', color: colors.gold },
  timeAgoWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  timeAgo: { fontSize: 9, color: colors.textMuted + 'AA' },

  // Empty state
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: spacing.xl },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },
  emptyTitle: { color: colors.text, fontSize: font.lg, fontWeight: '800', marginBottom: spacing.xs },
  emptyText: { color: colors.textMuted, fontSize: font.md, textAlign: 'center' },
  emptySubtext: { color: colors.textMuted + '88', fontSize: font.sm, textAlign: 'center', marginTop: spacing.xs, lineHeight: 20 },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },

  // Modals
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl,
    gap: spacing.md, borderTopWidth: 1, borderColor: colors.border,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.xs,
  },
  modalClose: {
    alignSelf: 'flex-end', padding: spacing.xs,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  modalGameBar: { height: 3, borderRadius: 2, marginBottom: spacing.xs },
  modalTitle: { fontSize: font.xl, fontWeight: '900', color: colors.text, lineHeight: 28, letterSpacing: -0.3 },
  modalPriceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: spacing.sm,
  },
  modalPrice: { fontSize: font.xxl, fontWeight: '900', color: colors.gold },
  modalBadges: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', alignItems: 'center' },
  condBadgeLg: { borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  condTextLg: { fontSize: font.xs, fontWeight: '800' },
  gameBadgeLg: {
    borderRadius: radius.sm,
    paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1,
  },
  gameBadgeLgText: { fontSize: font.xs, fontWeight: '700' },
  modalDesc: { fontSize: font.md, color: colors.textMuted, lineHeight: 22 },
  modalSellerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  modalSeller: { fontSize: font.sm, color: colors.textMuted, fontWeight: '600' },
  modalPosted: { fontSize: font.xs, color: colors.textMuted + '88' },
  modalDivider: { height: 1, backgroundColor: colors.border },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#eff6ff', borderRadius: radius.full,
    paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#bfdbfe',
  },
  verifiedText: { color: '#3b82f6', fontSize: font.xs, fontWeight: '700' },
  offerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingVertical: spacing.md, borderWidth: 1.5, borderColor: colors.primary,
  },
  offerBtnText: { color: colors.primaryLight, fontWeight: '800', fontSize: font.base },
  offerPriceHint: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.gold + '14', borderRadius: radius.md,
    padding: spacing.sm, borderWidth: 1, borderColor: colors.gold + '33',
  },
  offerPriceHintText: { color: colors.textMuted, fontSize: font.sm },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: spacing.md + 2, marginTop: spacing.xs,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 5,
  },
  contactBtnText: { color: colors.white, fontWeight: '900', fontSize: font.base, letterSpacing: 0.5 },
  feeBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.success + '15', borderRadius: radius.md,
    padding: spacing.sm, borderWidth: 1, borderColor: colors.success + '44',
  },
  feeText: { color: colors.success, fontSize: font.sm, flex: 1 },
  input: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.text, fontSize: font.md,
    borderWidth: 1, borderColor: colors.border,
  },
  inputMulti: { textAlignVertical: 'top', minHeight: 70 },
  inputLabel: { fontSize: font.sm, color: colors.textMuted, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
});
