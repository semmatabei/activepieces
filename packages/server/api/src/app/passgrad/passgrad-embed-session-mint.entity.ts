import { Project } from '@activepieces/shared';
import { EntitySchema } from 'typeorm';
import { ApIdSchema, BaseColumnSchemaPart } from '../database/database-common';

export type PassgradEmbedSessionMintSchema = {
  id: string;
  created: Date;
  updated: Date;
  projectId: string;
  passgradUserId: string;
  idempotencyKey: string;
  apUserId: string;
  apSessionId: string;
  project?: Project;
};

export const PassgradEmbedSessionMintEntity =
  new EntitySchema<PassgradEmbedSessionMintSchema>({
    name: 'passgrad_embed_session_mint',
    columns: {
      ...BaseColumnSchemaPart,
      projectId: {
        ...ApIdSchema,
        nullable: false,
      },
      passgradUserId: {
        type: String,
        length: 255,
        nullable: false,
      },
      idempotencyKey: {
        type: String,
        length: 255,
        nullable: false,
      },
      apUserId: {
        ...ApIdSchema,
        nullable: false,
      },
      apSessionId: {
        ...ApIdSchema,
        nullable: false,
      },
    },
    indices: [
      {
        name: 'idx_passgrad_embed_session_mint_idempotency',
        columns: ['projectId', 'passgradUserId', 'idempotencyKey'],
        unique: true,
      },
    ],
    relations: {
      project: {
        type: 'many-to-one',
        target: 'project',
        onDelete: 'CASCADE',
        joinColumn: {
          name: 'projectId',
          foreignKeyConstraintName: 'fk_passgrad_embed_session_mint_project_id',
        },
      },
    },
  });
