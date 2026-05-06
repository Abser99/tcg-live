import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host:     process.env.DATABASE_HOST ?? 'localhost',
  port:     parseInt(process.env.DATABASE_PORT ?? '5432'),
  database: process.env.DATABASE_NAME ?? 'tcglive',
  username: process.env.DATABASE_USER ?? 'postgres',
  password: process.env.DATABASE_PASSWORD ?? '',
  entities:   ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
