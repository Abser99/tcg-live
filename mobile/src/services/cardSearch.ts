export type GameType = 'pokemon' | 'mtg' | 'yugioh' | 'other';

export interface CardResult {
  id: string;
  name: string;
  set: string;
  number: string;
  imageUrl?: string;
  marketPriceUSD?: number;
}

export async function searchCards(game: GameType, query: string): Promise<CardResult[]> {
  if (query.trim().length < 2) return [];
  try {
    switch (game) {
      case 'pokemon': return await searchPokemon(query);
      case 'mtg':     return await searchMTG(query);
      case 'yugioh':  return await searchYugioh(query);
      default:        return [];
    }
  } catch {
    return [];
  }
}

async function searchPokemon(query: string): Promise<CardResult[]> {
  const q = encodeURIComponent(`name:"${query}"*`);
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${q}&pageSize=8`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data ?? []).map((c: any): CardResult => ({
    id: c.id,
    name: c.name,
    set: c.set?.name ?? '',
    number: c.number ?? '',
    imageUrl: c.images?.small,
    marketPriceUSD:
      c.cardmarket?.prices?.trendPrice ??
      c.tcgplayer?.prices?.holofoil?.market ??
      c.tcgplayer?.prices?.normal?.market,
  }));
}

async function searchMTG(query: string): Promise<CardResult[]> {
  const q = encodeURIComponent(query);
  const res = await fetch(`https://api.scryfall.com/cards/search?q=${q}&unique=cards`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data ?? []).slice(0, 8).map((c: any): CardResult => ({
    id: c.id,
    name: c.name,
    set: c.set_name ?? '',
    number: c.collector_number ?? '',
    imageUrl: c.image_uris?.small ?? c.card_faces?.[0]?.image_uris?.small,
    marketPriceUSD: parseFloat(c.prices?.usd ?? '') || undefined,
  }));
}

async function searchYugioh(query: string): Promise<CardResult[]> {
  const q = encodeURIComponent(query);
  const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${q}&num=8&offset=0`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data ?? []).map((c: any): CardResult => ({
    id: String(c.id),
    name: c.name,
    set: c.card_sets?.[0]?.set_name ?? '',
    number: c.card_sets?.[0]?.set_code ?? '',
    imageUrl: c.card_images?.[0]?.image_url_small,
    marketPriceUSD: parseFloat(c.card_prices?.[0]?.cardmarket_price ?? '') || undefined,
  }));
}
