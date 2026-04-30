import { api } from './client';
import { Auction, AuctionGame, AuctionItem, Bid, CreateAuctionPayload, MyBidEntry } from '../types';

export const auctionsApi = {
  list: (q?: string, game?: AuctionGame) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (game) params.set('game', game);
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
};
