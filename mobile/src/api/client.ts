import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// 10.0.2.2 is the Android emulator's alias for the host machine (localhost)
export const API_URL = 'http://10.0.2.2:3000/api';
export const WS_URL = 'http://10.0.2.2:3000';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
