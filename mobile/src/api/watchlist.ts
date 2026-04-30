import { api } from './client';
import { Auction } from '../types';

export const watchlistApi = {
  add: (auctionId: string) => api.post<void>(`/watchlist/${auctionId}`, {}),
  remove: (auctionId: string) => api.delete<void>(`/watchlist/${auctionId}`),
  mine: () => api.get<Auction[]>('/watchlist'),
  status: (auctionId: string) => api.get<{ watching: boolean }>(`/watchlist/${auctionId}/status`),
};
