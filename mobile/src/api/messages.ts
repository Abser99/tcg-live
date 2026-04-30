import { api } from './client';
import { Message } from '../types';

export const messagesApi = {
  list: (orderId: string) => api.get<Message[]>(`/messages/${orderId}`),
};
