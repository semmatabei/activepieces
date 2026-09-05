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
                        orderBy: () => ({ getOne: async () => event }),
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
                        orderBy: () => ({ getOne: async () => event }),
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
})
