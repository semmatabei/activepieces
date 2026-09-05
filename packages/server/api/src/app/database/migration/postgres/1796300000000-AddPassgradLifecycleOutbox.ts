import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddPassgradLifecycleOutbox1796300000000 implements Migration {
    name = 'AddPassgradLifecycleOutbox1796300000000'
    breaking = false
    release = '0.85.5'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "passgrad_lifecycle_outbox" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "flowRunId" character varying(21) NOT NULL,
                "eventId" character varying NOT NULL,
                "apEventSequence" integer NOT NULL,
                "payload" jsonb NOT NULL,
                "status" character varying NOT NULL DEFAULT 'PENDING',
                "attempts" integer NOT NULL DEFAULT 0,
                "nextAttemptAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "lockedAt" TIMESTAMP WITH TIME ZONE,
                "lastError" jsonb,
                CONSTRAINT "pk_passgrad_lifecycle_outbox" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(
            'CREATE INDEX "idx_passgrad_lifecycle_outbox_dispatch" ON "passgrad_lifecycle_outbox" ("status", "nextAttemptAt")',
        )
        await queryRunner.query(
            'CREATE INDEX "idx_passgrad_lifecycle_outbox_project" ON "passgrad_lifecycle_outbox" ("projectId")',
        )
        await queryRunner.query(
            'CREATE UNIQUE INDEX "idx_passgrad_lifecycle_outbox_event" ON "passgrad_lifecycle_outbox" ("flowRunId", "eventId")',
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            'DROP INDEX "idx_passgrad_lifecycle_outbox_project"',
        )
        await queryRunner.query(
            'DROP INDEX "idx_passgrad_lifecycle_outbox_dispatch"',
        )
        await queryRunner.query('DROP INDEX "idx_passgrad_lifecycle_outbox_event"')
        await queryRunner.query('DROP TABLE "passgrad_lifecycle_outbox"')
    }
}
