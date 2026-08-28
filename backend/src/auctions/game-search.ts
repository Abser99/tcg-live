/**
 * Turning what someone types in the search box into the game values an auction row
 * actually holds. Kept dependency-free so it can be tested on its own — people type
 * these names every way imaginable and a silent regression here is an empty page.
 */

/** How people actually type each game, mapped to the value stored on the auction. */
const GAME_ALIASES: Record<string, string[]> = {
  pokemon:    ['pokemon', 'pokémon', 'poke', 'pkmn'],
  mtg:        ['mtg', 'magic', 'magic the gathering', 'gathering'],
  yugioh:     ['yugioh', 'yu-gi-oh', 'yu gi oh', 'yugi', 'ygo'],
  onepiece:   ['onepiece', 'one piece', 'op'],
  lorcana:    ['lorcana', 'disney lorcana', 'disney'],
  dragonball: ['dragonball', 'dragon ball', 'dbz', 'dragón ball'],
  sports:     ['sports', 'deportes', 'deporte'],
  other:      ['other', 'otro', 'otros'],
};

/** Strip accents and collapse spacing so "Pokémon" and "one   piece" both land. */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Every game whose name contains what was typed — "piece" finds One Piece.
 * A single character matches nothing: it would drag in half the catalogue.
 */
export function gamesMatching(query: string): string[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  return Object.entries(GAME_ALIASES)
    .filter(([, aliases]) => aliases.some(a => normalize(a).includes(q)))
    .map(([value]) => value);
}
