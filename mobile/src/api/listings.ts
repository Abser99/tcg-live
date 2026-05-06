import { api } from './client';
import { ListingOffer } from '../types';

export interface Listing {
  id: string;
  sellerId: string;
  seller: { id: string; username: string; isVerified?: boolean };
  title: string;
  description: string | null;
  price: number; // MXN cents
  game: string | null;
  condition: string | null;
  imageUrls: string[] | null;
  status: 'active' | 'sold' | 'cancelled';
  createdAt: string;
}

export interface CreateListingDto {
  title: string;
  description?: string;
  price: number;
  game?: string;
  condition?: string;
}

export const listingsApi = {
  list: (game?: string, q?: string) =>
    api.get<Listing[]>('/listings', { params: { game: game ?? undefined, q: q ?? undefined } }),
  get: (id: string) => api.get<Listing>(`/listings/${id}`),
  create: (dto: CreateListingDto) => api.post<Listing>('/listings', dto),
  cancel: (id: string) => api.delete(`/listings/${id}`),
  markSold: (id: string) => api.patch(`/listings/${id}/sold`),
  mine: () => api.get<Listing[]>('/listings/mine'),

  // Offers
  createOffer: (listingId: string, amount: number, message?: string) =>
    api.post<ListingOffer>(`/listings/${listingId}/offers`, { amount, message }),
  getOffers: (listingId: string) =>
    api.get<ListingOffer[]>(`/listings/${listingId}/offers`),
  acceptOffer: (listingId: string, offerId: string) =>
    api.patch<ListingOffer>(`/listings/${listingId}/offers/${offerId}/accept`),
  declineOffer: (listingId: string, offerId: string) =>
    api.patch<ListingOffer>(`/listings/${listingId}/offers/${offerId}/decline`),
  withdrawOffer: (listingId: string, offerId: string) =>
    api.delete(`/listings/${listingId}/offers/${offerId}`),
  myOffers: () => api.get<ListingOffer[]>('/listings/offers/mine'),
};
