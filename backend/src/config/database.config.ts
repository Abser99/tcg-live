import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL ?? null,
  host: process.env.DATABASE_HOST ?? process.env.PGHOST ?? 'localhost',
  port: parseInt(process.env.DATABASE_PORT ?? process.env.PGPORT ?? '5432', 10),
  name: process.env.DATABASE_NAME ?? process.env.PGDATABASE ?? 'tcg_db',
  user: process.env.DATABASE_USER ?? process.env.PGUSER ?? 'tcg_user',
  password: process.env.DATABASE_PASSWORD ?? process.env.PGPASSWORD ?? '',
}));
