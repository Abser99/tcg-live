import { Body, Controller, Get, Post, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CardsService } from './cards.service';
import { ScanCardDto } from './dto/scan-card.dto';

@Controller('cards')
@UseGuards(AuthGuard('jwt'))
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post('scan')
  async scan(@Body() dto: ScanCardDto) {
    try {
      return await this.cardsService.scanCard(dto.imageBase64, dto.mimeType);
    } catch (err) {
      if (err instanceof Error && err.message === 'SCAN_UNAVAILABLE') {
        throw new ServiceUnavailableException(
          'No se pudo escanear la carta en este momento. Intenta de nuevo en unos segundos.',
        );
      }
      throw err;
    }
  }

  @Get('search-pokemon')
  async searchPokemon(@Query('q') q: string) {
    try {
      return await this.cardsService.searchPokemonCards(q ?? '');
    } catch (err) {
      if (err instanceof Error && err.message === 'POKEMON_API_UNAVAILABLE') {
        throw new ServiceUnavailableException(
          'No se pudo conectar con la base de datos de cartas. Intenta de nuevo en unos segundos.',
        );
      }
      throw err;
    }
  }
}
