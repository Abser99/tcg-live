export type UserRole = 'buyer' | 'seller' | 'admin';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  balance: number;
  reputationScore: number;
  totalRatings: number;
  totalRatingPoints: number;
  averageRating: number | null; // computed by backend on public profile
  role: UserRole;
  zipCode: string | null;
  street: string | null;
  colonia: string | null;
  city: string | null;
  state: string | null;
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface SellerApplication {
  id: string;
  userId: string;
  fullName: string;
  state: string;
  description: string;
  status: ApplicationStatus;
  reviewNote: string | null;
  createdAt: string;
}

export interface AuctionItem {
  id: string;
  auctionId: string;
  cardName: string;
  cardSet: string | null;
  cardNumber: string | null;
  condition: 'mint' | 'near_mint' | 'excellent' | 'good' | 'played';
  startingPrice: number;
  currentPrice: number;
  reservePrice: number | null;
  imageUrls: string[] | null;
  position: number;
  status: 'pending' | 'active' | 'sold' | 'unsold';
  winnerId: string | null;
  closesAt: string | null;
}

export type AuctionGame = 'pokemon' | 'mtg' | 'yugioh' | 'onepiece' | 'lorcana' | 'other';

export interface Auction {
  id: string;
  sellerId: string;
  seller: User;
  title: string;
  game: AuctionGame;
  description: string | null;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  scheduledAt: string | null;
  startedAt: string | null;
  items?: AuctionItem[];
  createdAt: string;
}

export interface CreateAuctionItemPayload {
  cardName: string;
  cardSet?: string;
  cardNumber?: string;
  condition?: AuctionItem['condition'];
  startingPrice: number;
  reservePrice?: number;
  imageUrls?: string[];
}

export interface CreateAuctionPayload {
  title: string;
  game?: AuctionGame;
  description?: string;
  scheduledAt?: string;
  items?: CreateAuctionItemPayload[];
}

export interface Bid {
  id: string;
  auctionItemId: string;
  bidderId: string;
  bidder: User;
  amount: number;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  auctionItemId: string;
  cardName: string;
  cardSet: string | null;
  finalPrice: number;
  imageUrls: string[] | null;
}

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered';

export interface Order {
  id: string;
  auctionId: string;
  buyerId: string;
  sellerId: string;
  status: OrderStatus;
  buyerZip: string | null;
  shippingChoice: 'combined' | 'individual' | null;
  shippingCost: number | null;
  carrier: string | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  items: OrderItem[];
  sellerRating: number | null;
  sellerRatingNote: string | null;
  createdAt: string;
}

export type PaymentMethodType = 'card' | 'oxxo' | 'spei';

export interface PaymentMethod {
  id: string;
  userId: string;
  type: PaymentMethodType;
  nickname: string;
  last4: string | null;
  brand: string | null;
  expiry: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface ShippingQuote {
  carrierId: string;
  carrier: string;
  service: string;
  priceCents: number;
  estimatedDays: number;
}

export interface ChatMessage {
  userId: string;
  username: string;
  message: string;
  timestamp: string;
}

export interface Reaction {
  id: string;
  userId: string;
  username: string;
  emoji: string;
}
