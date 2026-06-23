import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEscrowFields1750100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Create payout_status enum type
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE payout_status_enum AS ENUM ('pending', 'released', 'failed');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // Add escrow/payout columns to orders table
    await queryRunner.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS "payoutStatus" payout_status_enum NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS "payoutAmount" integer,
        ADD COLUMN IF NOT EXISTS "payoutReleasedAt" timestamptz
    `);

    // Add payout info columns to users table
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS "clabe" varchar(18),
        ADD COLUMN IF NOT EXISTS "mpPayoutEmail" varchar
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS "mpPayoutEmail",
        DROP COLUMN IF EXISTS "clabe"
    `);

    await queryRunner.query(`
      ALTER TABLE orders
        DROP COLUMN IF EXISTS "payoutReleasedAt",
        DROP COLUMN IF EXISTS "payoutAmount",
        DROP COLUMN IF EXISTS "payoutStatus"
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS payout_status_enum`);
  }
}
