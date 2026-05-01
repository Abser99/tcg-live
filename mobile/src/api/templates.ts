import { api } from './client';
import { AuctionTemplate } from '../types';

export const templatesApi = {
  mine:        () => api.get<AuctionTemplate[]>('/templates/my'),
  fromAuction: (auctionId: string) => api.post<AuctionTemplate>(`/templates/from-auction/${auctionId}`, {}),
  delete:      (id: string) => api.delete(`/templates/${id}`),
};
