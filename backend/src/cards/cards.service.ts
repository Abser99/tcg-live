import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface ScanResult {
  cardName: string;
  cardSet: string;
  cardNumber: string;
  game: 'pokemon' | 'mtg' | 'yugioh' | 'other';
}

@Injectable()
export class CardsService {
  private readonly client: Anthropic | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  async scanCard(imageBase64: string, mimeType: string): Promise<ScanResult> {
    if (!this.client) {
      return { cardName: '', cardSet: '', cardNumber: '', game: 'other' };
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
    type ValidType = (typeof validTypes)[number];
    const safeType: ValidType = validTypes.includes(mimeType as ValidType)
      ? (mimeType as ValidType)
      : 'image/jpeg';

    const response = await this.client.messages.create({
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
