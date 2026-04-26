import { api } from './client';
import { User } from '../types';

export const authApi = {
  register: (email: string, username: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/register', { email, username, password }),

  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/login', { email, password }),

  me: () => api.get<User>('/auth/me'),
};
