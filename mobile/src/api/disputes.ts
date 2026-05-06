import { api } from './client';
import { Dispute, DisputeReason, DisputeStatus } from '../types';

export const disputesApi = {
  open: (orderId: string, reason: DisputeReason, description: string) =>
    api.post<Dispute>('/disputes', { orderId, reason, description }),

  mine: () => api.get<Dispute[]>('/disputes/my'),

  all: () => api.get<Dispute[]>('/disputes'),

  resolve: (id: string, status: Extract<DisputeStatus, 'resolved' | 'rejected'>, resolutionNote?: string) =>
    api.patch<Dispute>(`/disputes/${id}/resolve`, { status, resolutionNote }),
};
