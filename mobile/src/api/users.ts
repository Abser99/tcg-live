import { api } from './client';
import { User } from '../types';

export const usersApi = {
  me: () => api.get<User>('/users/me'),

  getProfile: (id: string) => api.get<Partial<User>>(`/users/${id}/profile`),

  updateAddress: (data: {
    zipCode?: string;
    street?: string;
    colonia?: string;
    city?: string;
    state?: string;
  }) => api.patch<User>('/users/me/address', data),

  updateShipping: (data: {
    shippingNote?: string;
    shippingInsurance?: boolean;
  }) => api.patch<User>('/users/me/shipping', data),
};
