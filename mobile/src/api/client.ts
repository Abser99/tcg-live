import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Use your machine's local IP so the phone/simulator can reach the backend
export const API_URL = 'http://192.168.1.246:3000/api';
export const WS_URL = 'http://192.168.1.246:3000';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
