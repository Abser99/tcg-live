import { api } from './client';

export const followsApi = {
  follow:      (sellerId: string) => api.post(`/follows/${sellerId}`, {}),
  unfollow:    (sellerId: string) => api.delete(`/follows/${sellerId}`),
  status:      (sellerId: string) => api.get<{ following: boolean }>(`/follows/${sellerId}/status`),
};
