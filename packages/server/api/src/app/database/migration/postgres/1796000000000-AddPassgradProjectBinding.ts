import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddPassgradProjectBinding1796000000000 implements Migration {
    name = 'AddPassgradProjectBinding1796000000000'
    breaking = false
    release = '0.85.4'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "passgrad_project_binding" (
                "id" character varying(21) NOT NULL,
                "created" timestamp with time zone NOT NULL DEFAULT now(),
                "updated" timestamp with time zone NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "tenantId" character varying NOT NULL,
                "provisioningKey" character varying NOT NULL,
                "credentials" jsonb NOT NULL,
                CONSTRAINT "pk_passgrad_project_binding" PRIMARY KEY ("id"),
                CONSTRAINT "fk_passgrad_project_binding_project_id" FOREIGN KEY ("projectId")
                    REFERENCES "project" ("id") ON DELETE CASCADE
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "idx_passgrad_project_binding_project_id"
            ON "passgrad_project_binding" ("projectId")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "idx_passgrad_project_binding_tenant_id"
            ON "passgrad_project_binding" ("tenantId")
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX IF EXISTS "idx_passgrad_project_binding_tenant_id"')
        await queryRunner.query('DROP INDEX IF EXISTS "idx_passgrad_project_binding_project_id"')
        await queryRunner.query('DROP TABLE IF EXISTS "passgrad_project_binding"')
    }
}
