import { api } from './client';
import { Dispute, DisputeReason } from '../types';

export const disputesApi = {
  open: (orderId: string, reason: DisputeReason, description: string) =>
    api.post<Dispute>('/disputes', { orderId, reason, description }),

  mine: () => api.get<Dispute[]>('/disputes/my'),
};
