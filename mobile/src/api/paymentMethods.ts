import { api } from './client';
import { PaymentMethod, PaymentMethodType } from '../types';

export const paymentMethodsApi = {
  list: () => api.get<PaymentMethod[]>('/payment-methods/my'),

  hasAny: () => api.get<{ hasPaymentMethod: boolean }>('/payment-methods/my/has-any'),

  add: (data: {
    type: PaymentMethodType;
    cardNumber?: string;
    expiry?: string;
    cardholderName?: string;
  }) => api.post<PaymentMethod>('/payment-methods', data),

  setDefault: (id: string) => api.patch<PaymentMethod>(`/payment-methods/${id}/default`, {}),

  remove: (id: string) => api.delete<void>(`/payment-methods/${id}`),
};
