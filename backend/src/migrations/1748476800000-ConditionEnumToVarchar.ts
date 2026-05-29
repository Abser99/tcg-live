import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConditionEnumToVarchar1748476800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE auction_items
        ALTER COLUMN condition TYPE varchar(50) USING condition::varchar
    `);
    await queryRunner.query(`
      ALTER TABLE auction_items
        ALTER COLUMN condition SET DEFAULT 'near_mint'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE card_condition_enum AS ENUM ('mint','near_mint','excellent','good','played');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      ALTER TABLE auction_items
        ALTER COLUMN condition TYPE card_condition_enum
          USING condition::card_condition_enum
    `);
  }
}
