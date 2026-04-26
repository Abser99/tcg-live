export type UserRole = 'buyer' | 'seller' | 'admin';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  balance: number;
  reputationScore: number;
  role: UserRole;
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
}

export interface Auction {
  id: string;
  sellerId: string;
  seller: User;
  title: string;
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
}

export interface CreateAuctionPayload {
  title: string;
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
