import { api } from './client';
import { SellerApplication } from '../types';

export const sellerApplicationsApi = {
  apply: (fullName: string, state: string, description: string) =>
    api.post<SellerApplication>('/seller-applications', { fullName, state, description }),

  getMyApplication: () =>
    api.get<SellerApplication | null>('/seller-applications/me'),

  // admin only
  listAll: (status?: string) =>
    api.get<SellerApplication[]>('/seller-applications', { params: status ? { status } : {} }),

  review: (id: string, status: 'approved' | 'rejected', reviewNote?: string) =>
    api.patch<SellerApplication>(`/seller-applications/${id}/review`, { status, reviewNote }),
};
