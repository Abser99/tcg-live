import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// EXPO_PUBLIC_API_URL is set via .env (e.g. EXPO_PUBLIC_API_URL=https://api.tcglive.mx)
// Falls back to Android emulator alias for local development.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';

export const API_URL = `${BASE_URL}/api`;
// WS_URL is the base origin (no /api suffix) used by Socket.IO and LiveKit
export const WS_URL = BASE_URL;

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
