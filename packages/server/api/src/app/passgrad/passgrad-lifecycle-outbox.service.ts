import { isNil } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { transaction } from '../core/db/transaction'
import { passgradCapabilityService } from './passgrad-capability.service'
import {
    PassgradLifecycleOutbox,
    PassgradLifecycleOutboxEntity,
    PassgradLifecycleOutboxStatus,
} from './passgrad-lifecycle-outbox.entity'

const MAX_ATTEMPTS = 10
const BASE_BACKOFF_MS = 5_000
const STALE_LOCK_MS = 5 * 60 * 1_000

export const passgradLifecycleOutboxService = (log: FastifyBaseLogger) => ({
    async dispatchBatch(): Promise<void> {
        const event = await claimNextEvent()
        if (isNil(event)) return
        try {
            await passgradCapabilityService.request({
                operation: 'form.project-workflow-run',
                pieceName: '@activepieces/piece-passgrad-form',
                projectId: event.projectId,
                payload: event.payload,
            })
            await markCompleted(event.id)
            log.info(
                {
                    outbox: { id: event.id },
                    flowRun: { id: event.flowRunId },
                    project: { id: event.projectId },
                    event: { id: event.eventId },
                    attempt: event.attempts,
                },
                'Passgrad lifecycle projection delivered',
            )
        }
        catch (error) {
            await recordFailure(event, error)
            log.error(
                {
                    error,
                    outbox: { id: event.id },
                    flowRun: { id: event.flowRunId },
                    project: { id: event.projectId },
                    event: { id: event.eventId },
                    attempt: event.attempts,
                },
                'Passgrad lifecycle projection delivery failed',
            )
        }
    },
    async replayDeadLetter(id: string): Promise<void> {
        await transaction(async (entityManager) => {
            const repository = entityManager.getRepository(
                PassgradLifecycleOutboxEntity,
            )
            await repository.update(
                { id, status: PassgradLifecycleOutboxStatus.DEAD_LETTER },
                {
                    status: PassgradLifecycleOutboxStatus.PENDING,
                    attempts: 0,
                    nextAttemptAt: new Date(),
                    lockedAt: null,
                    lastError: null,
                    updated: new Date(),
                },
            )
        })
    },
})

async function claimNextEvent(): Promise<PassgradLifecycleOutbox | null> {
    return transaction(async (entityManager) => {
        const repository = entityManager.getRepository(
            PassgradLifecycleOutboxEntity,
        )
        const staleLockTime = new Date(Date.now() - STALE_LOCK_MS)
        const event = await repository
            .createQueryBuilder('outbox')
            .where(
                '(outbox.status = :pending AND outbox.nextAttemptAt <= :now) OR (outbox.status = :processing AND outbox.lockedAt < :staleLockTime)',
                {
                    pending: PassgradLifecycleOutboxStatus.PENDING,
                    processing: PassgradLifecycleOutboxStatus.PROCESSING,
                    now: new Date(),
                    staleLockTime,
                },
            )
            .setLock('pessimistic_write')
            .setOnLocked('skip_locked')
            .orderBy('outbox.nextAttemptAt', 'ASC')
            .getOne()
        if (isNil(event)) return null
        event.status = PassgradLifecycleOutboxStatus.PROCESSING
        event.attempts += 1
        event.lockedAt = new Date()
        event.updated = new Date()
        return repository.save(event)
    })
}

async function markCompleted(id: string): Promise<void> {
    await transaction(async (entityManager) => {
        await entityManager.getRepository(PassgradLifecycleOutboxEntity).update(
            { id },
            {
                status: PassgradLifecycleOutboxStatus.COMPLETED,
                lockedAt: null,
                updated: new Date(),
            },
        )
    })
}

async function recordFailure(
    event: PassgradLifecycleOutbox,
    error: unknown,
): Promise<void> {
    const terminal = event.attempts >= MAX_ATTEMPTS
    const delay = BASE_BACKOFF_MS * 2 ** Math.min(event.attempts - 1, 8)
    await transaction(async (entityManager) => {
        await entityManager.getRepository(PassgradLifecycleOutboxEntity).update(
            { id: event.id },
            {
                status: terminal
                    ? PassgradLifecycleOutboxStatus.DEAD_LETTER
                    : PassgradLifecycleOutboxStatus.PENDING,
                nextAttemptAt: new Date(Date.now() + delay),
                lockedAt: null,
                lastError: {
                    message: error instanceof Error ? error.message : String(error),
                    name: error instanceof Error ? error.name : 'UnknownError',
                    attempt: event.attempts,
                },
                updated: new Date(),
            },
        )
    })
}
