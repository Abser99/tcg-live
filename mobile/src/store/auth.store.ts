import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { authApi } from '../api/auth';
import { User } from '../types';
import { registerForPushNotifications, sendTokenToBackend } from '../services/pushNotifications';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (token) {
        const { data: user } = await authApi.me();
        set({ user, token });
      }
    } catch (err: any) {
      console.warn('Session restore failed:', err);
      // Only clear the token if the server explicitly rejects it (401)
      // Network errors or backend cold-start should not wipe the session
      if (err?.response?.status === 401) {
        await SecureStore.deleteItemAsync('token');
      }
    } finally {
      set({ isInitialized: true });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data } = await authApi.login(email, password);
      await SecureStore.setItemAsync('token', data.token);
      set({ user: data.user, token: data.token });
      registerForPushNotifications().then(t => { if (t) sendTokenToBackend(t); });
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (email, username, password) => {
    set({ isLoading: true });
    try {
      const { data } = await authApi.register(email, username, password);
      await SecureStore.setItemAsync('token', data.token);
      set({ user: data.user, token: data.token });
      registerForPushNotifications().then(t => { if (t) sendTokenToBackend(t); });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('token');
    set({ user: null, token: null });
  },

  setUser: (user) => set({ user }),
}));
