import { api } from './client';
import { Order, OrderStatus, SellerStats, ShippingQuote } from '../types';

export interface CheckoutResult {
  order: Order;
  initPoint: string;
  sandboxInitPoint: string;
}

export const ordersApi = {
  myOrders: () => api.get<Order[]>('/orders/my'),

  auctionOrders: (auctionId: string) => api.get<Order[]>(`/orders/auction/${auctionId}`),

  setShippingChoice: (orderId: string, choice: 'combined' | 'individual') =>
    api.patch<Order>(`/orders/${orderId}/shipping-choice`, { choice }),

  updateStatus: (orderId: string, status: OrderStatus) =>
    api.patch<Order>(`/orders/${orderId}/status`, { status }),

  confirmReceived: (orderId: string) =>
    api.patch<Order>(`/orders/${orderId}/received`, {}),

  rate: (orderId: string, rating: number, note?: string) =>
    api.post<Order>(`/orders/${orderId}/rate`, { rating, note }),

  generateLabel: (orderId: string, params: {
    carrierId: string;
    originZip: string;
    destinationZip: string;
    weightKg: number;
  }) => api.post<Order>(`/orders/${orderId}/label`, params),

  checkout: (orderId: string) =>
    api.post<CheckoutResult>('/payments/checkout', { orderId }),

  sellerStats: () => api.get<SellerStats>('/orders/seller-stats'),
};

export const shippingApi = {
  getQuotes: (params: {
    originZip: string;
    destinationZip: string;
    weightKg: number;
    items: number;
  }) => api.post<ShippingQuote[]>('/shipping/quote', params),
};
