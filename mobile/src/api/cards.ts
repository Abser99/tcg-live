import { api } from './client';

export interface CardScanResult {
  cardName: string;
  cardSet: string;
  cardNumber: string;
  game: 'pokemon' | 'mtg' | 'yugioh' | 'other';
}

export async function scanCardImage(imageBase64: string, mimeType = 'image/jpeg'): Promise<CardScanResult> {
  const { data } = await api.post<CardScanResult>('/cards/scan', { imageBase64, mimeType });
  return data;
}
