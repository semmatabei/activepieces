import { QueryRunner } from 'typeorm';
import { Migration } from '../../migration';

export class AddPassgradProjectBindingStatus1796200000000 implements Migration {
  name = 'AddPassgradProjectBindingStatus1796200000000';
  breaking = false;
  release = '0.85.5';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "passgrad_project_binding"
            ADD COLUMN IF NOT EXISTS "status" character varying NOT NULL DEFAULT 'ACTIVE'
        `);
    await queryRunner.query(`
            ALTER TABLE "passgrad_project_binding"
            ADD COLUMN IF NOT EXISTS "revokedAt" timestamp with time zone
        `);
    await queryRunner.query(`
            UPDATE "passgrad_project_binding" SET "status" = 'ACTIVE' WHERE "status" IS NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "passgrad_project_binding" DROP COLUMN IF EXISTS "revokedAt"'
    );
    await queryRunner.query(
      'ALTER TABLE "passgrad_project_binding" DROP COLUMN IF EXISTS "status"'
    );
  }
}
