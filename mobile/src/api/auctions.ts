import { api } from './client';
import { Auction, AuctionGame, AuctionItem, Bid, CreateAuctionPayload, MyBidEntry } from '../types';

export const auctionsApi = {
  list: (filters: {
    q?: string;
    game?: AuctionGame;
    condition?: string;
    minPrice?: number;
    maxPrice?: number;
  } = {}) => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.game) params.set('game', filters.game);
    if (filters.condition) params.set('condition', filters.condition);
    if (filters.minPrice) params.set('minPrice', String(filters.minPrice));
    if (filters.maxPrice) params.set('maxPrice', String(filters.maxPrice));
    const qs = params.toString();
    return api.get<Auction[]>(qs ? `/auctions?${qs}` : '/auctions');
  },

  listBySeller: (sellerId: string) => api.get<Auction[]>(`/auctions/seller/${sellerId}`),

  myAuctions: () => api.get<Auction[]>('/auctions/my'),

  get: (id: string) => api.get<Auction>(`/auctions/${id}`),

  create: (dto: CreateAuctionPayload) => api.post<Auction>('/auctions', dto),

  start: (id: string) => api.patch<Auction>(`/auctions/${id}/start`),

  end: (id: string) => api.patch<Auction>(`/auctions/${id}/end`),

  closeItem: (itemId: string) => api.patch<AuctionItem>(`/auctions/items/${itemId}/close`),

  getLiveKitToken: (auctionId: string) =>
    api.get<{ token: string; wsUrl: string }>(`/auctions/${auctionId}/livekit-token`),

  placeBid: (itemId: string, amount: number) =>
    api.post<Bid>(`/auctions/items/${itemId}/bids`, { amount }),

  getItemBids: (itemId: string) => api.get<Bid[]>(`/auctions/items/${itemId}/bids`),

  setMaxBid: (itemId: string, maxAmount: number) =>
    api.post(`/auctions/items/${itemId}/max-bid`, { maxAmount }),

  myBids: () => api.get<MyBidEntry[]>('/auctions/my-bids'),

  relist: (id: string) => api.post<Auction>(`/auctions/${id}/relist`, {}),
};
