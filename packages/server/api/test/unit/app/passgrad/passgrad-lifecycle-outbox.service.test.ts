import { describe, expect, it, vi } from 'vitest'

const { requestMock, transactionMock, repositoryMock } = vi.hoisted(() => ({
    requestMock: vi.fn(),
    transactionMock: vi.fn(),
    repositoryMock: {
        createQueryBuilder: vi.fn(),
        update: vi.fn(),
    },
}))

vi.mock('../../../../src/app/passgrad/passgrad-capability.service', () => ({
    passgradCapabilityService: { request: requestMock },
}))
vi.mock('../../../../src/app/core/db/transaction', () => ({
    transaction: transactionMock,
}))
vi.mock('../../../../src/app/passgrad/passgrad-lifecycle-outbox.entity', () => ({
    PassgradLifecycleOutboxEntity: {},
    PassgradLifecycleOutboxStatus: {
        PENDING: 'PENDING',
        PROCESSING: 'PROCESSING',
        COMPLETED: 'COMPLETED',
        DEAD_LETTER: 'DEAD_LETTER',
    },
}))

import { passgradLifecycleOutboxService } from '../../../../src/app/passgrad/passgrad-lifecycle-outbox.service'

describe('passgrad lifecycle outbox dispatcher', () => {
    it('delivers claimed event and marks it completed', async () => {
        const event = {
            id: 'outbox-1',
            projectId: 'project-1',
            flowRunId: 'run-1',
            eventId: 'run-1:lifecycle:SUCCEEDED',
            attempts: 1,
            payload: { type: 'workflow.run.projection.v1' },
        }
        const update = vi.fn()
        repositoryMock.createQueryBuilder.mockReturnValue({
            where: () => ({
                setLock: () => ({
                    setOnLocked: () => ({
                        orderBy: () => ({ getOne: vi.fn().mockResolvedValueOnce(event).mockResolvedValue(null) }),
                    }),
                }),
            }),
        })
        transactionMock.mockImplementation(async (operation: (manager: unknown) => Promise<unknown>) =>
            operation({ getRepository: () => ({ ...repositoryMock, update, save: async (value: unknown) => value }) }))
        requestMock.mockResolvedValue(undefined)

        await passgradLifecycleOutboxService({ info: vi.fn(), error: vi.fn() } as never).dispatchBatch()

        expect(requestMock).toHaveBeenCalledWith({
            operation: 'form.project-workflow-run',
            pieceName: '@activepieces/piece-passgrad-form',
            projectId: 'project-1',
            payload: event.payload,
        })
        expect(update).toHaveBeenCalledWith({ id: 'outbox-1' }, expect.objectContaining({ status: 'COMPLETED' }))
    })

    it('records retry metadata when Passgrad delivery fails', async () => {
        const event = {
            id: 'outbox-2',
            projectId: 'project-1',
            flowRunId: 'run-2',
            eventId: 'run-2:lifecycle:FAILED',
            attempts: 1,
            payload: { type: 'workflow.run.projection.v1' },
        }
        const update = vi.fn()
        repositoryMock.createQueryBuilder.mockReturnValue({
            where: () => ({
                setLock: () => ({
                    setOnLocked: () => ({
                        orderBy: () => ({ getOne: vi.fn().mockResolvedValueOnce(event).mockResolvedValue(null) }),
                    }),
                }),
            }),
        })
        transactionMock.mockImplementation(async (operation: (manager: unknown) => Promise<unknown>) =>
            operation({ getRepository: () => ({ ...repositoryMock, update, save: async (value: unknown) => value }) }))
        requestMock.mockRejectedValue(new Error('temporary Passgrad outage'))

        await passgradLifecycleOutboxService({ info: vi.fn(), error: vi.fn() } as never).dispatchBatch()

        expect(update).toHaveBeenCalledWith({ id: 'outbox-2' }, expect.objectContaining({
            status: 'PENDING',
            lastError: expect.objectContaining({ message: 'temporary Passgrad outage', attempt: 2 }),
        }))
    })

    function eventNamed(index: number) {
        return {
            id: `outbox-${index}`,
            projectId: 'project-1',
            flowRunId: 'run-9',
            eventId: `run-9:lifecycle:${index}`,
            attempts: 1,
            payload: { type: 'workflow.run.projection.v1', index },
        }
    }

    function claimQueue(events: ReturnType<typeof eventNamed>[]) {
        const remaining = [...events]
        repositoryMock.createQueryBuilder.mockReturnValue({
            where: () => ({
                setLock: () => ({
                    setOnLocked: () => ({
                        orderBy: () => ({ getOne: async () => remaining.shift() ?? null }),
                    }),
                }),
            }),
        })
        return remaining
    }

    it('delivers every due event in one pass, oldest first', async () => {
        const events = [eventNamed(1), eventNamed(2), eventNamed(3), eventNamed(4)]
        claimQueue(events)
        const update = vi.fn()
        transactionMock.mockImplementation(async (operation: (manager: unknown) => Promise<unknown>) =>
            operation({ getRepository: () => ({ ...repositoryMock, update, save: async (value: unknown) => value }) }))
        requestMock.mockReset()
        requestMock.mockResolvedValue(undefined)

        await passgradLifecycleOutboxService({ info: vi.fn(), error: vi.fn() } as never).dispatchBatch()

        expect(requestMock.mock.calls.map(([call]) => (call as { payload: { index: number } }).payload.index)).toEqual([1, 2, 3, 4])
        expect(update).toHaveBeenCalledTimes(4)
    })

    it('keeps going after one event fails', async () => {
        claimQueue([eventNamed(1), eventNamed(2)])
        const update = vi.fn()
        transactionMock.mockImplementation(async (operation: (manager: unknown) => Promise<unknown>) =>
            operation({ getRepository: () => ({ ...repositoryMock, update, save: async (value: unknown) => value }) }))
        requestMock.mockReset()
        requestMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined)

        await passgradLifecycleOutboxService({ info: vi.fn(), error: vi.fn() } as never).dispatchBatch()

        expect(requestMock).toHaveBeenCalledTimes(2)
        expect(update).toHaveBeenCalledWith({ id: 'outbox-1' }, expect.objectContaining({ status: 'PENDING' }))
        expect(update).toHaveBeenCalledWith({ id: 'outbox-2' }, expect.objectContaining({ status: 'COMPLETED' }))
    })

    it('runs one drain at a time and picks up events enqueued mid-drain', async () => {
        const queue = claimQueue([eventNamed(1)])
        const update = vi.fn()
        transactionMock.mockImplementation(async (operation: (manager: unknown) => Promise<unknown>) =>
            operation({ getRepository: () => ({ ...repositoryMock, update, save: async (value: unknown) => value }) }))
        let inFlight = 0
        let maxInFlight = 0
        requestMock.mockReset()
        requestMock.mockImplementation(async () => {
            inFlight += 1
            maxInFlight = Math.max(maxInFlight, inFlight)
            await new Promise((resolve) => setTimeout(resolve, 10))
            inFlight -= 1
        })
        const service = passgradLifecycleOutboxService({ info: vi.fn(), error: vi.fn() } as never)

        const first = service.dispatchBatch()
        // Arrives while event 1 is being delivered: must not start a second drain, and must not be missed.
        queue.push(eventNamed(2))
        const second = service.dispatchBatch()
        await Promise.all([first, second])

        expect(maxInFlight).toBe(1)
        expect(requestMock).toHaveBeenCalledTimes(2)
    })

    it('dispatchSoon delivers without being awaited and never throws to the caller', async () => {
        claimQueue([eventNamed(1)])
        transactionMock.mockImplementation(async (operation: (manager: unknown) => Promise<unknown>) =>
            operation({ getRepository: () => ({ ...repositoryMock, update: vi.fn(), save: async (value: unknown) => value }) }))
        requestMock.mockReset()
        requestMock.mockResolvedValue(undefined)
        const service = passgradLifecycleOutboxService({ info: vi.fn(), error: vi.fn() } as never)

        expect(service.dispatchSoon()).toBeUndefined()
        await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1))

        transactionMock.mockImplementation(async () => {
            throw new Error('database down')
        })
        expect(() => service.dispatchSoon()).not.toThrow()
        await new Promise((resolve) => setTimeout(resolve, 10))
    })
})
