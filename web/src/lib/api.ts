import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export const api = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 30_000,
});

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
  login: (email: string, password: string) =>
    api.post<{ token: string; user: ApiUser }>("/auth/login", { email, password }),

  register: (username: string, email: string, password: string) =>
    api.post<{ token: string; user: ApiUser }>("/auth/register", { username, email, password }),

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
    api.get<{ token: string; wsUrl: string }>(`/auctions/${auctionId}/livekit-token`),

  start:   (id: string, durationMs?: number) => api.patch(`/auctions/${id}/start`, durationMs ? { durationMs } : {}),
  end:     (id: string) => api.patch(`/auctions/${id}/end`),
  addItem: (id: string, dto: { cardName: string; startingPrice: number; imageUrls?: string[]; durationSeconds?: number; category?: string }) =>
    api.post<ApiAuction>(`/auctions/${id}/items`, dto),
  maxBid: (itemId: string, maxAmount: number) =>
    api.post(`/auctions/items/${itemId}/max-bid`, { maxAmount }),
  cancelMaxBid: (itemId: string) =>
    api.delete(`/auctions/items/${itemId}/max-bid`),
  closeItem: (itemId: string) =>
    api.patch(`/auctions/items/${itemId}/close`),
  update: (id: string, dto: { title?: string; game?: string }) =>
    api.patch<ApiAuction>(`/auctions/${id}`, dto),
  cancel:  (id: string) => api.patch<ApiAuction>(`/auctions/${id}/cancel`),
  archive: (id: string) => api.patch<ApiAuction>(`/auctions/${id}/archive`),
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
  }) => api.post<ApiListing>("/listings", dto),
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
  id: string;
  sellerId?: string;
  status: "live" | "ending" | "upcoming" | "scheduled" | "cancelled" | "ended";
  isStream?: boolean;
  title?: string;
  name?: string;
  set?: string;
  game?: string;
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
  items?: ApiAuctionItem[];
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
  closesAt?: string;
  winnerId?: string;
  bids?: ApiBid[];
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

export interface CreateAuctionPayload {
  title: string;
  game?: string;
  description?: string;
  isStream?: boolean;
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
