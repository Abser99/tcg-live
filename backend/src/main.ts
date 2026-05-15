import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { join } from 'path';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Accept DATABASE_URL (Railway style) OR individual DATABASE_* vars OR PG* vars
  const hasDb = process.env.DATABASE_URL || process.env.DATABASE_HOST || process.env.PGHOST;
  const hasRedis = process.env.REDIS_HOST || process.env.REDIS_URL;
  const missing: string[] = [];
  if (!hasDb) missing.push('DATABASE_URL or DATABASE_HOST');
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!hasRedis) missing.push('REDIS_HOST');

  if (missing.length) {
    logger.error(`Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const rawWebUrl = (process.env.WEB_URL ?? '').replace(/\/$/, '');
  const allowedOrigins = [
    rawWebUrl || null,
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: (origin, callback) => {
      if (
        !origin ||                                    // server-to-server
        !rawWebUrl ||                                 // WEB_URL not set → open (dev)
        allowedOrigins.includes(origin) ||            // exact match
        /\.vercel\.app$/.test(origin) ||              // any Vercel preview URL
        /^http:\/\/localhost(:\d+)?$/.test(origin)    // any localhost port
      ) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  app.useWebSocketAdapter(new IoAdapter(app));

  // KYC docs served only in dev — in production store on Cloudinary, not local disk
  if (process.env.NODE_ENV !== 'production') {
    app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
