import { Controller, Get, Param, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GeoService } from './geo.service';

@Controller('geo')
@UseGuards(AuthGuard('jwt'))
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('cp/:cp')
  async lookupZip(@Param('cp') cp: string) {
    try {
      return await this.geoService.lookupZip(cp);
    } catch (err) {
      if (err instanceof Error && err.message === 'GEO_API_UNAVAILABLE') {
        throw new ServiceUnavailableException(
          'No se pudo verificar el código postal. Intenta de nuevo en unos segundos.',
        );
      }
      throw err;
    }
  }
}
