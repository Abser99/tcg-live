import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsStreamToAuctions1748563200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE auctions
        ADD COLUMN IF NOT EXISTS "isStream" boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE auctions DROP COLUMN IF EXISTS "isStream"
    `);
  }
}
