/**
 * What the search box understands when someone types a game. This is the only thing
 * standing between "one piece" and an empty results page, and people type these names
 * every way imaginable — accented, hyphenated, abbreviated, half-remembered.
 */
import { gamesMatching } from './game-search';

const matching = (q: string) => gamesMatching(q).sort();

describe('gamesMatching — the names people actually type', () => {
  it.each([
    ['one piece',           'onepiece'],
    ['One Piece',           'onepiece'],
    ['onepiece',            'onepiece'],
    ['piece',               'onepiece'],
    ['lorcana',             'lorcana'],
    ['disney',              'lorcana'],
    ['pokemon',             'pokemon'],
    ['Pokémon',             'pokemon'],   // accented, as the UI spells it
    ['POKEMON',             'pokemon'],
    ['pkmn',                'pokemon'],
    ['yu-gi-oh',            'yugioh'],
    ['yu gi oh',            'yugioh'],
    ['ygo',                 'yugioh'],
    ['magic',               'mtg'],
    ['magic the gathering', 'mtg'],
    ['dragon ball',         'dragonball'],
    ['dbz',                 'dragonball'],
    ['deportes',            'sports'],
  ])('%s → %s', (typed, expected) => {
    expect(matching(typed)).toContain(expected);
  });

  it('trims and collapses whitespace', () => {
    expect(matching('  one   piece  ')).toEqual(['onepiece']);
  });

  it('ignores a single character, so typing "o" does not return half the catalogue', () => {
    expect(matching('o')).toEqual([]);
    expect(matching('')).toEqual([]);
  });

  it('returns nothing for a seller name, leaving that to the username match', () => {
    expect(matching('tcg_master_mx')).toEqual([]);
  });

  it('returns every game a shared substring hits, never silently picking one', () => {
    // "or" sits inside both "lorcana" and "deportes".
    expect(matching('or')).toEqual(['lorcana', 'sports']);
  });

  it('only ever returns values the auction column can hold', () => {
    const valid = new Set(['pokemon', 'mtg', 'yugioh', 'onepiece', 'lorcana', 'dragonball', 'sports', 'other']);
    for (const q of ['pokemon', 'magic', 'one piece', 'deportes', 'otro', 'disney', 'ygo']) {
      for (const g of gamesMatching(q)) expect(valid.has(g)).toBe(true);
    }
  });
});
