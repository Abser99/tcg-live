import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CardsService } from './cards.service';
import { ScanCardDto } from './dto/scan-card.dto';

@Controller('cards')
@UseGuards(AuthGuard('jwt'))
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post('scan')
  scan(@Body() dto: ScanCardDto) {
    return this.cardsService.scanCard(dto.imageBase64, dto.mimeType);
  }
}
