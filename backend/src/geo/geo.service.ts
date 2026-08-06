import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ZipLookupResult {
  cp: string;
  colonias: string[];
  municipio: string;
  estado: string;
  ciudad: string;
}

interface CopomexResponse {
  error: boolean;
  error_message?: string | null;
  response?: {
    cp: string;
    asentamiento: string | string[];
    municipio: string;
    estado: string;
    ciudad: string;
  };
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — postal code data barely changes

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly token: string;
  private readonly cache = new Map<string, { data: ZipLookupResult | null; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {
    this.token = this.config.get<string>('COPOMEX_TOKEN') ?? 'pruebas';
    if (this.token === 'pruebas') {
      this.logger.warn(
        'COPOMEX_TOKEN not set — using the shared demo token (returns placeholder data, rate-limited). Get a free token at copomex.com',
      );
    }
  }

  async lookupZip(cp: string): Promise<ZipLookupResult | null> {
    const clean = cp.trim();
    if (!/^\d{5}$/.test(clean)) return null;

    const cached = this.cache.get(clean);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const maxAttempts = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(
          `https://api.copomex.com/query/info_cp/${clean}?type=simplified&token=${this.token}`,
          { signal: AbortSignal.timeout(5000) },
        );

        if (!res.ok) {
          // A bad/missing token (401/403) or rate-limit (429) means we can't tell
          // whether the CP is valid — that's a service problem, not a bad CP.
          // Only a genuine 4xx like 400 (malformed request) fails fast as "not found".
          if (res.status < 500 && ![401, 403, 429].includes(res.status)) {
            this.logger.warn(`Copomex API returned ${res.status} for CP ${clean}`);
            return null;
          }
          lastError = new Error(`HTTP ${res.status}`);
          this.logger.warn(`Copomex API returned ${res.status} for CP ${clean} (attempt ${attempt}/${maxAttempts})`);
        } else {
          const body = (await res.json()) as CopomexResponse;
          if (body.error || !body.response) {
            this.cache.set(clean, { data: null, expiresAt: Date.now() + CACHE_TTL_MS });
            return null;
          }

          const r = body.response;
          const result: ZipLookupResult = {
            cp: clean,
            colonias: Array.isArray(r.asentamiento) ? r.asentamiento : [r.asentamiento].filter(Boolean),
            municipio: r.municipio ?? '',
            estado: r.estado ?? '',
            ciudad: r.ciudad || r.municipio || '',
          };
          this.cache.set(clean, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
          return result;
        }
      } catch (err) {
        lastError = err;
        this.logger.warn(`Failed to reach Copomex API for CP ${clean} (attempt ${attempt}/${maxAttempts}): ${err}`);
      }

      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }

    this.logger.error(`Copomex API failed after ${maxAttempts} attempts for CP ${clean}: ${lastError}`);
    // Surface the failure distinctly from a genuinely-invalid CP so the UI
    // can tell the user to retry instead of implying the postal code is wrong.
    throw new Error('GEO_API_UNAVAILABLE');
  }
}
