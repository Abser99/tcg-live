import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export const api = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 10_000,
});

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
        window.location.href = "/login";
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
  list: (params?: { q?: string; condition?: string; minPrice?: number; maxPrice?: number }) =>
    api.get<ApiAuction[]>("/auctions", { params }),

  get: (id: string) => api.get<ApiAuction>(`/auctions/${id}`),

  my: () => api.get<ApiAuction[]>("/auctions/my"),

  myBids: () => api.get<ApiBid[]>("/auctions/my-bids"),

  create: (dto: CreateAuctionPayload) => api.post<ApiAuction>("/auctions", dto),

  bid: (itemId: string, amount: number) =>
    api.post(`/auctions/items/${itemId}/bids`, { amount }),

  livekitToken: (auctionId: string) =>
    api.get<{ token: string; wsUrl: string }>(`/auctions/${auctionId}/livekit-token`),

  start:   (id: string) => api.patch(`/auctions/${id}/start`),
  end:     (id: string) => api.patch(`/auctions/${id}/end`),
  addItem: (id: string, dto: { cardName: string; startingPrice: number; imageUrls?: string[] }) =>
    api.post<ApiAuction>(`/auctions/${id}/items`, dto),
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

  markReceived: (id: string) => api.patch(`/orders/${id}/received`),
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
  add: (auctionId: string) => api.post("/watchlist", { auctionId }),
  remove: (id: string) => api.delete(`/watchlist/${id}`),
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
}

export interface ApiAuction {
  id: string;
  status: "live" | "ending" | "upcoming" | "ended";
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
  condition: string;
  startingBid: number;
  currentBid?: number;
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
  createdAt: string;
  trackingNumber?: string;
  seller?: { username: string };
  buyer?: { username: string };
  items?: { cardName: string; finalPrice: number }[];
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
  items: { cardName: string; cardSet?: string; condition?: string; startingPrice: number; binPrice?: number; imageUrls?: string[] }[];
  scheduledAt?: string;
}
