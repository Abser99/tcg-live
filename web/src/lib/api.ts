import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export const api = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 30_000,
});

/** Absolute URL for a file the API stores (recordings, documents, …).
    Those paths are relative to the API host; left as-is the browser would resolve
    them against the web app's own origin and 404. */
export function fileUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path; // already absolute (e.g. cloud storage)
  return `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

let _redirectToLogin: (() => void) | null = null;
export function setRedirectHandler(fn: () => void) { _redirectToLogin = fn; }

// Attach JWT on every request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("tcg_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Normalize backend field names → frontend aliases.
// The API returns `currentPrice`/`startingPrice` (cents), but the UI reads
// `currentBid`/`startingBid`. Walk the response and add the aliases so every
// screen (home, list, detail, seller, shop, profile) shows the real amounts.
function normalizeBidFields(node: unknown, depth = 0): unknown {
  if (depth > 6 || node == null || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    node.forEach((n) => normalizeBidFields(n, depth + 1));
    return node;
  }
  const obj = node as Record<string, unknown>;
  // Item-level alias
  if (typeof obj.currentPrice === "number" && obj.currentBid == null) obj.currentBid = obj.currentPrice;
  if (typeof obj.startingPrice === "number" && obj.startingBid == null) obj.startingBid = obj.startingPrice;
  // Recurse first so nested items are aliased before we derive auction-level values
  for (const key of Object.keys(obj)) normalizeBidFields(obj[key], depth + 1);
  // Auction-level: derive from the active item (fallback to the first item)
  if (Array.isArray(obj.items) && obj.items.length > 0) {
    const items = obj.items as Array<Record<string, unknown>>;
    const active = items.find((i) => i.status === "active") ?? items[0];
    if (obj.currentBid == null && typeof active?.currentBid === "number") obj.currentBid = active.currentBid;
    if (obj.startingBid == null && typeof items[0]?.startingBid === "number") obj.startingBid = items[0].startingBid;
  }
  return node;
}

api.interceptors.response.use((res) => {
  if (res?.data) normalizeBidFields(res.data);
  return res;
});

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("tcg_token");
      localStorage.removeItem("tcg_user");
      if (!window.location.pathname.startsWith("/login")) {
        if (_redirectToLogin) {
          _redirectToLogin();
        } else {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(err);
  }
);

// ─── Auth ──────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string, rememberMe?: boolean) =>
    api.post<{ token: string; user: ApiUser }>("/auth/login", { email, password, rememberMe }),

  register: (
    username: string, email: string, password: string, over18: boolean,
    extra?: { birthDate?: string; acceptedTerms?: boolean },
  ) =>
    api.post<{ token: string; user: ApiUser }>("/auth/register", {
      username, email, password, over18, ...extra,
    }),

  me: () => api.get<ApiUser>("/auth/me"),

  forgotPassword: (email: string) =>
    api.post("/auth/forgot-password", { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post("/auth/reset-password", { token, newPassword }),
};

// ─── Auctions ──────────────────────────────────────────────────
export const auctionsApi = {
  list: (params?: { q?: string; condition?: string; minPrice?: number; maxPrice?: number; page?: number; limit?: number }) =>
    api.get<AuctionListResponse>("/auctions", { params }),

  get: (id: string) => api.get<ApiAuction>(`/auctions/${id}`),

  my: () => api.get<ApiAuction[]>("/auctions/my"),

  myBids: () => api.get<ApiBid[]>("/auctions/my-bids"),

  create: (dto: CreateAuctionPayload) => api.post<ApiAuction>("/auctions", dto),

  bid: (itemId: string, amount: number) =>
    api.post(`/auctions/items/${itemId}/bids`, { amount }),

  livekitToken: (auctionId: string) =>
    api.get<{ token: string; wsUrl: string; videoAvailable?: boolean; videoIssue?: string }>(`/auctions/${auctionId}/livekit-token`),

  start:   (id: string, durationMs?: number) => api.patch(`/auctions/${id}/start`, durationMs ? { durationMs } : {}),
  end:     (id: string) => api.patch(`/auctions/${id}/end`),
  addItem: (id: string, dto: { cardName?: string; startingPrice: number; imageUrls?: string[]; durationSeconds?: number; category?: string }) =>
    api.post<ApiAuction>(`/auctions/${id}/items`, dto),
  maxBid: (itemId: string, maxAmount: number) =>
    api.post(`/auctions/items/${itemId}/max-bid`, { maxAmount }),
  cancelMaxBid: (itemId: string) =>
    api.delete(`/auctions/items/${itemId}/max-bid`),
  closeItem: (itemId: string) =>
    api.patch(`/auctions/items/${itemId}/close`),
  update: (id: string, dto: {
    title?: string;
    displayName?: string;
    game?: string;
    reactionEmojis?: string[];
    bidMode?: BidMode;
    dutchFloorCents?: number;
  }) => api.patch<ApiAuction>(`/auctions/${id}`, dto),
  setModerator: (id: string, userId: string, action: "add" | "remove") =>
    api.patch<ApiAuction>(`/auctions/${id}/moderators`, { userId, action }),
  createSanction: (id: string, dto: { targetUserId: string; targetUsername: string; kind: "mute" | "ban"; hours?: number }) =>
    api.post<ApiSanction>(`/auctions/${id}/sanctions`, dto),
  approveSanction: (id: string, sid: string) => api.patch<ApiSanction>(`/auctions/${id}/sanctions/${sid}/approve`),
  liftSanction: (id: string, sid: string) => api.delete(`/auctions/${id}/sanctions/${sid}`),
  pauseLive:  (id: string) => api.patch<ApiAuction>(`/auctions/${id}/pause`),
  resumeLive: (id: string) => api.patch<ApiAuction>(`/auctions/${id}/resume`),
  setItemTimer: (itemId: string, seconds: number) =>
    api.patch<ApiAuctionItem>(`/auctions/items/${itemId}/timer`, { seconds }),
  openItem:    (itemId: string) => api.post<ApiAuctionItem>(`/auctions/items/${itemId}/open`),
  dutchStart:  (itemId: string) => api.post<ApiAuctionItem>(`/auctions/items/${itemId}/dutch-start`),
  dutchAccept: (itemId: string) => api.post<{ item: ApiAuctionItem; price: number }>(`/auctions/items/${itemId}/dutch-accept`),
  cancel:  (id: string) => api.patch<ApiAuction>(`/auctions/${id}/cancel`),
  archive: (id: string) => api.patch<ApiAuction>(`/auctions/${id}/archive`),
  segments: (id: string) => api.get<ApiSegments>(`/auctions/${id}/segments`),

  /** "Still watching" — credits time toward raffle entries. */
  /** `ref` is the username of whoever's invite link brought this viewer in. */
  heartbeat: (id: string, ref?: string) =>
    api.post<ApiWatchTime>(`/auctions/${id}/heartbeat`, null, ref ? { params: { ref } } : undefined),
  watchTime: (id: string) => api.get<ApiWatchTime>(`/auctions/${id}/watch-time`),
  raffles:      (id: string) => api.get<ApiRaffle[]>(`/auctions/${id}/raffles`),
  createRaffle: (id: string, dto: { prizeTitle: string; prizeListingId?: string; minMinutes?: number; prizeImageUrl?: string }) =>
    api.post<ApiRaffle>(`/auctions/${id}/raffles`, dto),
  /** Multipart: a photo of the prize, straight from the camera or the library. */
  uploadRaffleImage: (id: string, form: FormData) =>
    api.post<{ url: string }>(`/auctions/${id}/raffle-image`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60_000,
    }),
  /** Money, lots and time on air for the seller running this live. */
  liveStats: (id: string) => api.get<ApiLiveStats>(`/auctions/${id}/live-stats`),
  drawRaffle:   (id: string, raffleId: string) =>
    api.post<{ raffle: ApiRaffle; order: ApiOrder | null; participants: number }>(`/auctions/${id}/raffles/${raffleId}/draw`),
  cancelRaffle: (id: string, raffleId: string) => api.delete(`/auctions/${id}/raffles/${raffleId}`),
  /** Hand the roulette prize to its winner: records it and creates their order. */
  awardGiveaway: (id: string, dto: { winnerUsername: string; listingId?: string }) =>
    api.post<{ awarded: boolean; winner: string; order: ApiOrder | null }>(`/auctions/${id}/giveaway`, dto),
  /** Multipart: a short preview for a scheduled show. */
  uploadTrailer: (id: string, form: FormData) =>
    api.post<ApiAuction>(`/auctions/${id}/trailer`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 180_000,
    }),
  removeTrailer: (id: string) => api.delete<ApiAuction>(`/auctions/${id}/trailer`),
  /** Multipart: the browser-captured recording for this live. */
  uploadRecording: (id: string, form: FormData) =>
    api.post<ApiAuction>(`/auctions/${id}/recording`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 300_000, // a long session is a big upload
    }),
};

/** A report an admin has to look at. */
export type IncidentKind = "live" | "no_response" | "seller_report" | "other";
export type IncidentStatus = "open" | "reviewing" | "resolved" | "dismissed";
export interface ApiIncident {
  id: string;
  kind: IncidentKind;
  reporterId: string;
  reporterUsername: string | null;
  auctionId: string | null;
  orderId: string | null;
  reportedUsername: string | null;
  description: string;
  /** Where in the live's recording this happened, when it happened in one. */
  atOffsetSec: number | null;
  fromOffsetSec: number | null;
  toOffsetSec: number | null;
  status: IncidentStatus;
  adminNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export const incidentsApi = {
  create: (dto: { kind: IncidentKind; description: string; auctionId?: string; orderId?: string; reportedUsername?: string }) =>
    api.post<ApiIncident>("/incidents", dto),
  mine: () => api.get<ApiIncident[]>("/incidents/mine"),
  list: (status?: IncidentStatus) => api.get<ApiIncident[]>("/incidents", { params: status ? { status } : {} }),
  resolve: (id: string, status: IncidentStatus, adminNote?: string) =>
    api.patch<ApiIncident>(`/incidents/${id}/resolve`, { status, adminNote }),
};

// ─── Admin reporting ───────────────────────────────────────────
export const adminStatsApi = {
  overview: () => api.get<ApiAdminOverview>("/admin/stats/overview"),
  sellers:  (limit = 50) => api.get<ApiSellerStatsRow[]>("/admin/stats/sellers", { params: { limit } }),
  buyers:   (limit = 50) => api.get<ApiBuyerStatsRow[]>("/admin/stats/buyers", { params: { limit } }),
};

// ─── Orders ────────────────────────────────────────────────────
export const ordersApi = {
  my: () => api.get<ApiOrder[]>("/orders/my"),

  selling: () => api.get<ApiOrder[]>("/orders/selling"),

  sellerStats: () => api.get<SellerStats>("/orders/seller-stats"),

  auctionOrders: (auctionId: string) =>
    api.get<ApiOrder[]>(`/orders/auction/${auctionId}`),

  updateStatus: (id: string, status: string) =>
    api.patch(`/orders/${id}/status`, { status }),

  updateTracking: (id: string, trackingNumber: string) =>
    api.patch(`/orders/${id}/tracking`, { trackingNumber }),

  markReceived: (id: string) => api.patch(`/orders/${id}/received`),
  rateOrder: (id: string, rating: number, note?: string) =>
    api.post<ApiOrder>(`/orders/${id}/rate`, { rating, note }),
};

// ─── Payment methods (wallet / saved cards) ────────────────────
export const paymentMethodsApi = {
  my: () => api.get<ApiPaymentMethod[]>("/payment-methods/my"),
  create: (dto: { type: "card" | "oxxo" | "spei"; cardNumber?: string; expiry?: string; cardholderName?: string } & CardAddressInput) =>
    api.post<ApiPaymentMethod>("/payment-methods", dto),
  /** Edit a saved card. Not the number — only its last four were ever stored. */
  update: (id: string, dto: { expiry?: string; cardholderName?: string } & CardAddressInput) =>
    api.patch<ApiPaymentMethod>(`/payment-methods/${id}`, dto),
  setDefault: (id: string) => api.patch(`/payment-methods/${id}/default`),
  remove: (id: string) => api.delete(`/payment-methods/${id}`),
};

// ─── Notifications (in-app feed / bell) ────────────────────────
export const notificationsApi = {
  list: () => api.get<{ items: ApiNotification[]; unread: number }>("/notifications"),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch("/notifications/read-all"),
};

// ─── Payments ──────────────────────────────────────────────────
export const paymentsApi = {
  checkout: (orderId: string, backUrls?: CheckoutBackUrls) =>
    api.post<CheckoutResult>("/payments/checkout", { orderId, backUrls }),

  status: (paymentId: string) =>
    api.get<PaymentStatus>(`/payments/${paymentId}/status`),
};

// ─── Watchlist ─────────────────────────────────────────────────
export const watchlistApi = {
  my: () => api.get<WatchlistItem[]>("/watchlist"),
  add: (auctionId: string) => api.post(`/watchlist/${auctionId}`),
  remove: (id: string) => api.delete(`/watchlist/${id}`),
};

// ─── Cards (Pokémon TCG lookup) ─────────────────────────────────
export interface PokemonCardResult {
  id: string;
  name: string;
  set: string;
  series: string;
  number: string;
  rarity: string | null;
  image: string;
  imageLarge: string;
  marketPriceCents: number | null;
}

export const cardsApi = {
  searchPokemon: (q: string) =>
    api.get<PokemonCardResult[]>("/cards/search-pokemon", { params: { q } }),
};

// ─── Geo (Mexican postal code lookup) ───────────────────────────
export interface ZipLookupResult {
  cp: string;
  colonias: string[];
  municipio: string;
  estado: string;
  ciudad: string;
}

export const geoApi = {
  lookupZip: (cp: string) => api.get<ZipLookupResult | null>(`/geo/cp/${cp}`),
};

// ─── Listings ──────────────────────────────────────────────────
export const listingsApi = {
  list: (params?: { q?: string; game?: string }) =>
    api.get<ApiListing[]>("/listings", { params }),
  get:  (id: string) => api.get<ApiListing>(`/listings/${id}`),
  my:   () => api.get<ApiListing[]>("/listings/mine"),
  create: (dto: {
    title: string;
    price: number;
    game?: string;
    condition?: string;
    description?: string;
    imageUrls?: string[];
    discountPercent?: number;
    promoted?: boolean;
  }) => api.post<ApiListing>("/listings", dto),
  update: (id: string, dto: Partial<{
    title: string;
    price: number;
    description: string;
    discountPercent: number;
    promoted: boolean;
    game: string;
    condition: string;
    imageUrls: string[];
  }>) => api.patch<ApiListing>(`/listings/${id}`, dto),
  markSold: (id: string) => api.patch(`/listings/${id}/sold`),
  cancel:   (id: string) => api.delete(`/listings/${id}`),
  buy:      (id: string) => api.post<ApiOrder>(`/listings/${id}/buy`),
};

// ─── Users ─────────────────────────────────────────────────────
export const usersApi = {
  me: () => api.get<ApiUser>("/users/me"),
  updateProfile: (dto: { username?: string; displayName?: string; avatarUrl?: string }) =>
    api.patch<ApiUser>("/users/me", dto),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.patch("/users/me/password", { currentPassword, newPassword }),
  updateAddress: (dto: { zipCode?: string; street?: string; colonia?: string; city?: string; state?: string }) =>
    api.patch<ApiUser>("/users/me/address", dto),
  publicProfile: (username: string) =>
    api.get<PublicProfile>(`/users/by-username/${encodeURIComponent(username)}/profile`),
  updatePayoutInfo: (data: { clabe?: string; mpPayoutEmail?: string }) =>
    api.patch('/users/me/payout-info', data).then(r => r.data),
  // Admin
  listAll: (page = 1) =>
    api.get<AdminUserListResponse>(`/users?page=${page}&limit=20`).then((r) => r.data),
  suspend: (id: string, reason: string) =>
    api.patch<AdminUser>(`/users/${id}/suspend`, { reason }),
  unsuspend: (id: string) =>
    api.patch<AdminUser>(`/users/${id}/unsuspend`),
};

// ─── Disputes ──────────────────────────────────────────────────
export const disputesApi = {
  open: (dto: { orderId: string; reason: string; description: string }) =>
    api.post<ApiDispute>("/disputes", dto),
  my: () => api.get<ApiDispute[]>("/disputes/my"),
  all: () => api.get<ApiDispute[]>("/disputes"),
  resolve: (id: string, status: "resolved" | "rejected", resolutionNote: string) =>
    api.patch<ApiDispute>(`/disputes/${id}/resolve`, { status, resolutionNote }),
};

// ─── Messages ──────────────────────────────────────────────────
export const messagesApi = {
  threads: () => api.get<MessageThread[]>("/messages"),
  getMessages: (orderId: string) => api.get<ApiMessage[]>(`/messages/${orderId}`),
  send: (orderId: string, body: string) => api.post<ApiMessage>(`/messages/${orderId}`, { body }),
};

// ─── Seller Applications ───────────────────────────────────────
export const sellerApplicationsApi = {
  apply: (dto: { fullName: string; state: string; description: string }) =>
    api.post<SellerApplication>("/seller-applications", dto),
  myApplication: () => api.get<SellerApplication | null>("/seller-applications/me"),
  // Admin
  list: (status?: string) => api.get<SellerApplication[]>("/seller-applications", { params: status ? { status } : {} }),
  review: (id: string, status: "approved" | "rejected", note?: string) =>
    api.patch(`/seller-applications/${id}/review`, { status, reviewNote: note }),
};

// ─── Shipping ──────────────────────────────────────────────────
export const shippingApi = {
  quote: (params: { originZip: string; destinationZip: string; weightKg: number; items: number }) =>
    api.post<ShippingQuote[]>('/shipping/quote', params).then(r => r.data),
  generateLabel: (orderId: string, params: { carrierId: string; originZip: string; destinationZip: string; weightKg: number }) =>
    api.post<ApiOrder>(`/orders/${orderId}/label`, params).then(r => r.data),
};

export interface ShippingQuote {
  carrierId: string;
  carrier: string;
  service: string;
  priceCents: number;
  estimatedDays: number;
}

// ─── Admin / Orders ────────────────────────────────────────────
export const adminOrdersApi = {
  getPendingPayouts: () => api.get<ApiOrder[]>('/orders/pending-payouts').then(r => r.data),
  releasePayout: (orderId: string) => api.post<ApiOrder>(`/orders/${orderId}/release-payout`).then(r => r.data),
};

// ─── Seller Documents ──────────────────────────────────────────
export const sellerDocumentsApi = {
  uploadFromUrl: (documentType: string, fileUrl: string, emissionDate?: string) =>
    api.post("/seller-documents/from-url", { documentType, fileUrl, emissionDate }),
  myDocuments: () => api.get<SellerDocumentRecord[]>("/seller-documents/me"),
  // Admin
  listAll: (status?: string) => api.get<SellerDocumentRecord[]>("/seller-documents", { params: status ? { status } : {} }),
  review: (id: string, status: "approved" | "rejected", note?: string) =>
    api.patch(`/seller-documents/${id}/review`, { status, rejectionNote: note }),
};

// ─── Types ─────────────────────────────────────────────────────
export interface AuctionListResponse {
  data: ApiAuction[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiUser {
  id: string;
  username: string;
  email: string;
  role: "BUYER" | "SELLER" | "ADMIN";
  displayName?: string;
  avatarUrl?: string;
  reputationScore?: number;
  reputation?: number;
  isVerified?: boolean;
  zipCode?: string;
  street?: string;
  colonia?: string;
  city?: string;
  state?: string;
  shippingNote?: string;
  shippingInsurance?: boolean;
  createdAt?: string;
  clabe?: string | null;
  mpPayoutEmail?: string | null;
}

export interface ApiAuction {
  /** Short preview shown while a scheduled show is still waiting to start. */
  trailerUrl?: string | null;
  id: string;
  sellerId?: string;
  status: "live" | "ending" | "upcoming" | "scheduled" | "cancelled" | "ended";
  isStream?: boolean;
  reactionEmojis?: string[] | null;
  title?: string;
  /** Seller-chosen name for the show; falls back to `title` when unset. */
  displayName?: string | null;
  name?: string;
  set?: string;
  game?: string;
  categories?: string[] | null;
  condition?: string;
  startingBid?: number;
  currentBid?: number;
  viewers?: number;
  timer?: string;
  seller?: { id: string; username: string; verified?: boolean };
  sellerName?: string;
  binPrice?: number;
  description?: string;
  totalBids?: number;
  endTime?: string;
  /** When a scheduled stream is set to go live (ISO). Present on status "scheduled". */
  scheduledAt?: string | null;
  /** Where this live's recording is stored, once one exists. */
  recordingUrl?: string | null;
  /** Clock zero the replay offsets are measured from. */
  recordingStartedAt?: string | null;
  items?: ApiAuctionItem[];
  /** Set while the seller is away from the live (bidding frozen). */
  pausedAt?: string | null;
  moderatorIds?: string[] | null;
  sanctions?: ApiSanction[];      // active mutes/bans
  pendingBans?: ApiSanction[];    // permanent bans awaiting seller approval
  /** Bidding format the seller can switch live. */
  bidMode?: BidMode;
  dutchFloorCents?: number;
}

/** normal = clock extends on late bids · sudden_death = fixed clock · dutch = descending price */
export type BidMode = "normal" | "sudden_death" | "dutch";

export interface ApiSanction {
  id: string;
  targetUserId: string;
  targetUsername: string;
  kind: "mute" | "ban";
  expiresAt: string | null; // null = permanent
  approved: boolean;
  createdByUsername: string;
}

export interface ApiAuctionItem {
  id: string;
  cardName: string;
  cardSet?: string;
  condition: string;
  startingBid: number;
  currentBid?: number;
  imageUrls?: string[];
  category?: string;
  status?: string;
  position?: number;
  closesAt?: string;
  winnerId?: string;
  binPrice?: number; // "buy it now" price, MXN cents
  dutchStartedAt?: string | null; // when the descending clock started (dutch mode)
  updatedAt?: string;             // last change — used to time the winner splash
  winner?: { id: string; username: string; avatarUrl?: string | null }; // who is currently winning
  winnerHasMaxBid?: boolean;                 // the lead is being held by an auto-bid
  challenger?: { username: string; avatarUrl?: string | null }; // most recent bidder who isn't the winner (pushing the leader)
  lastBidder?: { username: string; avatarUrl?: string | null }; // who placed the most recent HUMAN bid (ignores proxy auto-bids)
  bids?: ApiBid[];
}

/** Bid step scales with the price — mirrors the server so the UI never disagrees. */
export function bidIncrement(currentCents: number): number {
  if (currentCents >= 500_000) return 20_000; // $5,000+  → $200
  if (currentCents >= 100_000) return 10_000; // $1,000+  → $100
  if (currentCents >= 40_000)  return 5_000;  // $400+    → $50
  return 2_000;                               // under $400 → $20
}

export interface ApiBid {
  id: string;
  amount: number;
  createdAt: string;
  bidder?: { username: string };
  auction?: ApiAuction;
  item?: ApiAuctionItem;
  status?: string;
}

export interface ApiOrder {
  id: string;
  status: string;
  totalAmount: number;
  totalCents?: number;
  paymentStatus?: string;
  createdAt: string;
  trackingNumber?: string;
  labelUrl?: string;
  carrier?: string;
  buyerZip?: string;
  sellerRating?: number;
  sellerRatingNote?: string;
  seller?: { username: string; clabe?: string | null; mpPayoutEmail?: string | null };
  buyer?: { username: string };
  items?: { cardName: string; finalPrice: number; imageUrls?: string[] }[];
  /** The live this order came from, when it came from one — used to open the replay. */
  auctionId?: string | null;
  /** Won in a live giveaway: nothing was paid, but it still ships. */
  isGiveaway?: boolean;
  payoutStatus?: 'pending' | 'released' | 'failed';
  payoutAmount?: number | null;
  payoutReleasedAt?: string | null;
}

export interface SellerStats {
  totalRevenue: number;
  pendingOrders: number;
  activeAuctions: number;
}

export interface CheckoutBackUrls {
  success: string;
  failure: string;
  pending: string;
}

export interface CheckoutResult {
  order: ApiOrder;
  initPoint: string;
  sandboxInitPoint: string;
}

export interface PaymentStatus {
  id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  statusDetail: string;
  amount: number;
  orderId: string | null;
}

export interface WatchlistItem {
  id: string;
  auction?: ApiAuction;
}

export interface ApiDispute {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  reason: string;
  description: string;
  status: "open" | "under_review" | "resolved" | "rejected";
  resolutionNote?: string;
  createdAt: string;
  updatedAt: string;
  buyer?: { username: string; email: string } | null;
  seller?: { username: string; email: string } | null;
}

export interface ApiPaymentMethod {
  id: string;
  type: "card" | "oxxo" | "spei";
  nickname?: string;
  last4?: string;
  brand?: string;
  expiry?: string;
  isDefault?: boolean;
  cardholderName?: string | null;
  /** Billing address — lives on the card, since one person can bill two places. */
  billingName?: string | null;
  street?: string | null;
  extNumber?: string | null;
  intNumber?: string | null;
  colonia?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export interface CardAddressInput {
  billingName?: string;
  street?: string;
  extNumber?: string;
  intNumber?: string;
  colonia?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface ApiNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface MessageThread {
  id: string;
  orderId: string;
  otherUser?: { username: string };
  lastMessage?: { content: string; createdAt: string };
  unreadCount?: number;
}

export interface ApiMessage {
  id: string;
  orderId: string;
  senderId: string;
  senderUsername: string;
  body: string;
  createdAt: string;
}

export interface PublicProfile {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  role: string;
  reputationScore: number;
  totalRatings: number;
  totalRatingPoints: number;
  isVerified: boolean;
  createdAt: string;
  averageRating: number | null;
}

export interface ApiListing {
  id: string;
  title: string;
  description?: string;
  price: number;
  game?: string;
  condition?: string;
  imageUrls?: string[];
  status: "active" | "sold" | "cancelled";
  createdAt: string;
  seller?: { id: string; username: string; isVerified?: boolean };
  acceptsOffers?: boolean;
  discountPercent?: number;
  promoted?: boolean;
}

export interface SellerApplication {
  id: string;
  status: "pending" | "approved" | "rejected";
  fullName: string;
  state: string;
  description: string;
  reviewNote?: string;
  createdAt: string;
  userId?: string;
  user?: { id: string; username: string; email: string };
}

export interface SellerDocumentRecord {
  id: string;
  documentType: string;
  fileUrl: string;
  status: "pending" | "approved" | "rejected";
  emissionDate?: string;
  rejectionNote?: string;
  isExpired?: boolean;
  userId?: string;
  user?: { id: string; username: string; email: string };
}

/** Watch time and the raffle entries it earns, including the friend multiplier. */
export interface ApiWatchTime {
  watchedSec: number;
  minutes: number;
  /** 2× per connected friend you invited, capped. */
  multiplier: number;
  connectedFriends: number;
  entries: number;
}

/** Admin reporting. */
export interface ApiAdminOverview {
  users: { total: number; sellers: number; buyers: number; suspended: number; new_week: number };
  auctions: { total: number; live: number; scheduled: number; ended: number; streamedMinutes: number };
  orders: { total: number; paid: number; unpaid: number; giveaways: number; revenueCents: number; gmvCents: number; commissionCents: number };
  bids: { total: number; automatic: number; bidders: number };
  watch: { watchedMinutes: number; viewers: number };
  raffles: { total: number; drawn: number };
}
export interface ApiSellerStatsRow {
  username: string; userId: string; verified: boolean;
  lives: number; streamedMinutes: number; orders: number;
  revenueCents: number; bidsReceived: number; audienceMinutes: number; viewers: number;
}
export interface ApiBuyerStatsRow {
  username: string; userId: string;
  orders: number; spentCents: number; giveaways: number;
  bids: number; watchedMinutes: number; livesAttended: number;
}

/** A raffle on a live. Entries come from watch time — one per minute. */
/** The seller's own scoreboard while the show is running. */
export interface ApiLiveStats {
  soldCents: number;
  buyers: number;
  lotsSold: number;
  /** Raffles already drawn — what the seller still owes and to whom. */
  raffles?: { prizeTitle: string; winnerUsername: string | null; winnerEntries: number | null; totalEntries: number | null }[];
  startedAt: string | null;
  endedAt: string | null;
}

export interface ApiRaffle {
  id: string;
  auctionId: string;
  prizeTitle: string;
  prizeListingId: string | null;
  /** Photo of the prize, under /uploads. Run it through fileUrl() to display it. */
  prizeImageUrl: string | null;
  /** How many viewers currently clear this raffle's watch-time bar. */
  participants?: number;
  minMinutes: number;
  status: "pending" | "drawn" | "cancelled";
  winnerUsername: string | null;
  winnerEntries: number | null;
  totalEntries: number | null;
  drawnAt: string | null;
  createdAt: string;
}

/** Where each lot — and each bid on it — sits inside a live's recording. */
export interface ApiBidMarker {
  id: string;
  offsetSec: number | null;
  at: string;
  amount: number;
  username: string;
  isViewer: boolean;
  auto: boolean;
}
export interface ApiSegment {
  itemId: string;
  cardName: string;
  imageUrls: string[];
  status: string;
  startOffsetSec: number | null;
  endOffsetSec: number | null;
  openedAt: string | null;
  closedAt: string | null;
  startingPrice: number;
  finalPrice: number;
  winner: { id: string; username: string } | null;
  wonByViewer: boolean;
  bids: ApiBidMarker[];
}
export interface ApiSegments {
  auctionId: string;
  title: string;
  seller: { id: string; username: string } | null;
  recordingUrl: string | null;
  recordingStartedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  viewerRole: "seller" | "admin" | "buyer";
  segments: ApiSegment[];
}

/** Following a seller (server-side): powers the ♥ and the "seller is live" push. */
export const followsApi = {
  mine:     () => api.get<{ sellerId: string; username: string }[]>("/follows/mine"),
  follow:   (sellerId: string) => api.post<{ following: boolean }>(`/follows/${sellerId}`),
  unfollow: (sellerId: string) => api.delete<{ following: boolean }>(`/follows/${sellerId}`),
  status:   (sellerId: string) => api.get<{ following: boolean }>(`/follows/${sellerId}/status`),
};

export interface CreateAuctionPayload {
  /** Ignored by the server — it assigns `puja #0001-MM-YYYY`. */
  title?: string;
  game?: string;
  categories?: string[];
  description?: string;
  isStream?: boolean;
  reactionEmojis?: string[];
  items?: { cardName: string; cardSet?: string; condition?: string; startingPrice: number; binPrice?: number; imageUrls?: string[] }[];
  scheduledAt?: string;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  isSuspended: boolean;
  suspendedAt: string | null;
  suspendReason: string | null;
  isVerified: boolean;
  createdAt: string;
}

export interface AdminUserListResponse {
  data: AdminUser[];
  total: number;
  page: number;
  limit: number;
}
