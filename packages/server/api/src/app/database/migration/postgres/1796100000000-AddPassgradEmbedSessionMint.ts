import { QueryRunner } from 'typeorm';
import { Migration } from '../../migration';

export class AddPassgradEmbedSessionMint1796100000000 implements Migration {
  name = 'AddPassgradEmbedSessionMint1796100000000';
  breaking = false;
  release = '0.85.4';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "passgrad_embed_session_mint" (
                "id" character varying(21) NOT NULL,
                "created" timestamp with time zone NOT NULL DEFAULT now(),
                "updated" timestamp with time zone NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "passgradUserId" character varying NOT NULL,
                "idempotencyKey" character varying NOT NULL,
                "apUserId" character varying(21) NOT NULL,
                "apSessionId" character varying(21) NOT NULL,
                CONSTRAINT "pk_passgrad_embed_session_mint" PRIMARY KEY ("id"),
                CONSTRAINT "fk_passgrad_embed_session_mint_project_id" FOREIGN KEY ("projectId")
                    REFERENCES "project" ("id") ON DELETE CASCADE
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "idx_passgrad_embed_session_mint_idempotency"
            ON "passgrad_embed_session_mint" ("projectId", "passgradUserId", "idempotencyKey")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_passgrad_embed_session_mint_idempotency"'
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "passgrad_embed_session_mint"'
    );
  }
}
