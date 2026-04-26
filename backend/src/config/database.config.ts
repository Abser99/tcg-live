import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  name: process.env.DATABASE_NAME ?? 'tcg_db',
  user: process.env.DATABASE_USER ?? 'tcg_user',
  password: process.env.DATABASE_PASSWORD ?? '',
}));
