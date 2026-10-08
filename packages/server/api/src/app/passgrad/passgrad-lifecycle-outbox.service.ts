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

/**
 * Most events one pass delivers before yielding. A run emits a handful of events, so this is far
 * above normal use; it only bounds a pass over a large backlog (the next cron tick continues it).
 */
const MAX_EVENTS_PER_DRAIN = 200

// One drain at a time per process: events are claimed oldest-first, and a second concurrent drain
// would only deliver neighbouring events out of order. A request that arrives while one is running
// is answered by another pass straight after it, so nothing enqueued mid-drain waits for the cron.
let activeDrain: Promise<void> | null = null
let drainRequestedAgain = false

async function drain(log: FastifyBaseLogger): Promise<void> {
    if (!isNil(activeDrain)) {
        drainRequestedAgain = true
        return activeDrain
    }
    activeDrain = (async () => {
        try {
            do {
                drainRequestedAgain = false
                for (let delivered = 0; delivered < MAX_EVENTS_PER_DRAIN; delivered++) {
                    const claimed = await dispatchNext(log)
                    if (!claimed) break
                }
            } while (drainRequestedAgain)
        }
        finally {
            activeDrain = null
        }
    })()
    return activeDrain
}

/** Delivers the oldest due event. Returns false when nothing was due. */
async function dispatchNext(log: FastifyBaseLogger): Promise<boolean> {
    const event = await claimNextEvent()
    if (isNil(event)) return false
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
    return true
}

export const passgradLifecycleOutboxService = (log: FastifyBaseLogger) => ({
    /** Cron safety net: delivers everything that is due, not just one event. */
    async dispatchBatch(): Promise<void> {
        await drain(log)
    },
    /** Called right after an event is enqueued so Passgrad hears about it now, not on the next tick. */
    dispatchSoon(): void {
        drain(log).catch((error: unknown) => {
            log.error({ error }, 'Passgrad lifecycle projection drain failed')
        })
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
