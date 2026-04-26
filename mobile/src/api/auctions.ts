import { api } from './client';
import { Auction, AuctionItem, Bid, CreateAuctionPayload } from '../types';

export const auctionsApi = {
  list: () => api.get<Auction[]>('/auctions'),

  myAuctions: () => api.get<Auction[]>('/auctions/my'),

  get: (id: string) => api.get<Auction>(`/auctions/${id}`),

  create: (dto: CreateAuctionPayload) => api.post<Auction>('/auctions', dto),

  start: (id: string) => api.patch<Auction>(`/auctions/${id}/start`),

  end: (id: string) => api.patch<Auction>(`/auctions/${id}/end`),

  closeItem: (itemId: string) => api.patch<AuctionItem>(`/auctions/items/${itemId}/close`),

  placeBid: (itemId: string, amount: number) =>
    api.post<Bid>(`/auctions/items/${itemId}/bids`, { amount }),

  getItemBids: (itemId: string) => api.get<Bid[]>(`/auctions/items/${itemId}/bids`),
};
