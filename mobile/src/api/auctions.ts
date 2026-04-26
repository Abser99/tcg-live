import { api } from './client';
import { Auction, Bid } from '../types';

export const auctionsApi = {
  list: () => api.get<Auction[]>('/auctions'),

  get: (id: string) => api.get<Auction>(`/auctions/${id}`),

  placeBid: (itemId: string, amount: number) =>
    api.post<Bid>(`/auctions/items/${itemId}/bids`, { amount }),

  getItemBids: (itemId: string) => api.get<Bid[]>(`/auctions/items/${itemId}/bids`),
};
