import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface ScanResult {
  cardName: string;
  cardSet: string;
  cardNumber: string;
  game: 'pokemon' | 'mtg' | 'yugioh' | 'other';
}

export interface PokemonCardResult {
  id: string;
  name: string;
  set: string;
  series: string;
  number: string;
  rarity: string | null;
  image: string;
  imageLarge: string;
  marketPriceCents: number | null;
}

interface PokemonTcgApiCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  set?: { name?: string; series?: string };
  images?: { small?: string; large?: string };
  cardmarket?: { prices?: { averageSellPrice?: number; trendPrice?: number } };
}

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — autocomplete queries repeat a lot

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);
  private readonly client: Anthropic | null;
  private readonly pokemonApiKey: string | undefined;
  private readonly searchCache = new Map<string, { data: PokemonCardResult[]; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    this.pokemonApiKey = config.get<string>('POKEMONTCG_API_KEY');
  }

  async searchPokemonCards(query: string): Promise<PokemonCardResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    const cacheKey = q.toLowerCase();
    const cached = this.searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    // Escape double quotes to avoid breaking the Lucene-style query syntax
    const safeName = q.replace(/"/g, '\\"');
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${safeName}*"`)}&pageSize=20&orderBy=-set.releaseDate`;

    // The public Pokemon TCG API (especially without an API key) intermittently
    // returns 500s / connection errors under normal load. Retry transient
    // failures before giving up, and never silently mask an error as "no results".
    const maxAttempts = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, {
          headers: this.pokemonApiKey ? { 'X-Api-Key': this.pokemonApiKey } : {},
        });

        if (!res.ok) {
          // 4xx (bad query, invalid key) won't fix itself on retry — fail fast.
          if (res.status < 500) {
            this.logger.warn(`Pokemon TCG API returned ${res.status} for query "${q}"`);
            return [];
          }
          lastError = new Error(`HTTP ${res.status}`);
          this.logger.warn(
            `Pokemon TCG API returned ${res.status} for query "${q}" (attempt ${attempt}/${maxAttempts})`,
          );
        } else {
          const body = (await res.json()) as { data?: PokemonTcgApiCard[] };
          const results: PokemonCardResult[] = (body.data ?? []).map((c) => {
            const price = c.cardmarket?.prices?.averageSellPrice ?? c.cardmarket?.prices?.trendPrice;
            return {
              id: c.id,
              name: c.name,
              set: c.set?.name ?? '',
              series: c.set?.series ?? '',
              number: c.number,
              rarity: c.rarity ?? null,
              image: c.images?.small ?? '',
              imageLarge: c.images?.large ?? '',
              marketPriceCents: typeof price === 'number' ? Math.round(price * 100) : null,
            };
          });

          this.searchCache.set(cacheKey, { data: results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
          return results;
        }
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `Failed to reach Pokemon TCG API for query "${q}" (attempt ${attempt}/${maxAttempts}): ${err}`,
        );
      }

      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }

    this.logger.error(`Pokemon TCG API failed after ${maxAttempts} attempts for query "${q}": ${lastError}`);
    // Surface the failure distinctly from a real "no results" so the UI can
    // tell the user to retry instead of implying the card doesn't exist.
    throw new Error('POKEMON_API_UNAVAILABLE');
  }

  async scanCard(imageBase64: string, mimeType: string): Promise<ScanResult> {
    if (!this.client) {
      this.logger.error('scanCard called but ANTHROPIC_API_KEY is not configured');
      throw new Error('SCAN_UNAVAILABLE');
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
    type ValidType = (typeof validTypes)[number];
    const safeType: ValidType = validTypes.includes(mimeType as ValidType)
      ? (mimeType as ValidType)
      : 'image/jpeg';

    let response: Awaited<ReturnType<Anthropic['messages']['create']>>;
    try {
      response = await this.client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: safeType, data: imageBase64 },
              },
              {
                type: 'text',
                text: 'Identify this trading card. Reply with ONLY a JSON object, no markdown:\n{"cardName":"<exact name>","cardSet":"<set name>","cardNumber":"<collector number or empty string>","game":"pokemon|mtg|yugioh|other"}',
              },
            ],
          },
        ],
      });
    } catch (err) {
      this.logger.error(`Anthropic API call failed in scanCard: ${err}`);
      throw new Error('SCAN_UNAVAILABLE');
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock && 'text' in textBlock ? textBlock.text.trim() : '{}';

    try {
      const parsed = JSON.parse(text);
      const game = ['pokemon', 'mtg', 'yugioh'].includes(parsed.game) ? parsed.game : 'other';
      return {
        cardName: String(parsed.cardName ?? ''),
        cardSet: String(parsed.cardSet ?? ''),
        cardNumber: String(parsed.cardNumber ?? ''),
        game,
      };
    } catch {
      return { cardName: '', cardSet: '', cardNumber: '', game: 'other' };
    }
  }
}
