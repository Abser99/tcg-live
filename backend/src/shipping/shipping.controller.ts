import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ShippingService } from './shipping.service';
import { QuoteShippingDto } from './dto/quote-shipping.dto';

@Controller('shipping')
@UseGuards(AuthGuard('jwt'))
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Post('quote')
  getQuotes(@Body() dto: QuoteShippingDto) {
    return this.shippingService.getQuotes({
      originZip:      dto.originZip,
      destinationZip: dto.destinationZip,
      weightKg:       dto.weightKg,
      items:          dto.items,
    });
  }
}
