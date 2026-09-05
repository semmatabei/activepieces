import { EntitySchema } from 'typeorm'
import { ApIdSchema, BaseColumnSchemaPart } from '../database/database-common'

export enum PassgradLifecycleOutboxStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    DEAD_LETTER = 'DEAD_LETTER',
}

export type PassgradLifecycleOutbox = {
    id: string
    created: Date
    updated: Date
    projectId: string
    flowRunId: string
    eventId: string
    apEventSequence: number
    payload: Record<string, unknown>
    status: PassgradLifecycleOutboxStatus
    attempts: number
    nextAttemptAt: Date
    lockedAt: Date | null
    lastError: Record<string, unknown> | null
}

export const PassgradLifecycleOutboxEntity =
  new EntitySchema<PassgradLifecycleOutbox>({
      name: 'passgrad_lifecycle_outbox',
      columns: {
          ...BaseColumnSchemaPart,
          projectId: { ...ApIdSchema, nullable: false },
          flowRunId: { ...ApIdSchema, nullable: false },
          eventId: { type: String, nullable: false },
          apEventSequence: { type: Number, nullable: false },
          payload: { type: 'jsonb', nullable: false },
          status: {
              type: String,
              enum: Object.values(PassgradLifecycleOutboxStatus),
              default: PassgradLifecycleOutboxStatus.PENDING,
              nullable: false,
          },
          attempts: { type: Number, nullable: false, default: 0 },
          nextAttemptAt: { type: Date, nullable: false },
          lockedAt: { type: Date, nullable: true },
          lastError: { type: 'jsonb', nullable: true },
      },
      indices: [
          {
              name: 'idx_passgrad_lifecycle_outbox_dispatch',
              columns: ['status', 'nextAttemptAt'],
          },
          {
              name: 'idx_passgrad_lifecycle_outbox_event',
              columns: ['flowRunId', 'eventId'],
              unique: true,
          },
      ],
  })
