export type GameKey = 'pokemon' | 'mtg' | 'yugioh' | 'onepiece' | 'lorcana' | 'other';

export const GAME_COLORS: Record<GameKey, { bg: string; text: string }> = {
  pokemon:  { bg: '#F8D030', text: '#5A3A00' },
  mtg:      { bg: '#7038F8', text: '#FFFFFF' },
  yugioh:   { bg: '#705898', text: '#FFFFFF' },
  onepiece: { bg: '#F08030', text: '#FFFFFF' },
  lorcana:  { bg: '#6890F0', text: '#FFFFFF' },
  other:    { bg: '#A8A878', text: '#FFFFFF' },
};

export const ALL_GAME_COLOR = { bg: '#FFD900', text: '#5A3A00' };

export function getGameColor(game?: string | null): { bg: string; text: string } {
  if (!game) return ALL_GAME_COLOR;
  return GAME_COLORS[game as GameKey] ?? { bg: '#A8A878', text: '#FFFFFF' };
}
