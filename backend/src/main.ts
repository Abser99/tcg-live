import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { join } from 'path';
import helmet from 'helmet';
import { AppModule } from './app.module';

const REQUIRED_ENV = [
  'DATABASE_HOST', 'DATABASE_NAME', 'DATABASE_USER', 'DATABASE_PASSWORD',
  'JWT_SECRET', 'REDIS_HOST',
];

async function bootstrap() {
  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missing.length) {
    new Logger('Bootstrap').error(`Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const webUrl = process.env.WEB_URL;
  const allowedOrigins = [
    webUrl,
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: webUrl
      ? (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) callback(null, true);
          else callback(new Error('Not allowed by CORS'));
        }
      : true, // WEB_URL not set — allow all origins (dev / pre-launch)
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
