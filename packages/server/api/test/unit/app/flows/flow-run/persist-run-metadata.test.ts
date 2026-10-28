import { beforeEach, describe, expect, it, vi } from 'vitest'

const { transactionMock, flowRunRepoMock, fileRepositoryMock } = vi.hoisted(() => ({
    transactionMock: vi.fn(),
    flowRunRepoMock: { findOneBy: vi.fn(), findOneByOrFail: vi.fn(), update: vi.fn() },
    fileRepositoryMock: { findOneBy: vi.fn() },
}))

// The flow-run module graph reaches the sqlite driver, which has no native binding on this machine
// and is never used by the code under test.
vi.mock('sqlite3', () => ({}))
vi.mock('../../../../../src/app/core/db/transaction', () => ({
    transaction: transactionMock,
}))
vi.mock('../../../../../src/app/flows/flow-run/flow-run-service', () => ({
    flowRunRepo: () => flowRunRepoMock,
}))
vi.mock('../../../../../src/app/file/file.entity', () => ({
    FileEntity: { options: { name: 'file' } },
}))
vi.mock('../../../../../src/app/passgrad/passgrad-lifecycle-outbox.entity', () => ({
    PassgradLifecycleOutboxEntity: { options: { name: 'passgrad_lifecycle_outbox' } },
    PassgradLifecycleOutboxStatus: { PENDING: 'PENDING' },
}))

import { persistRunMetadataAndPassgradOutbox } from '../../../../../src/app/flows/flow-run/flow-runs-queue'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn(), trace: vi.fn(), child: () => log } as never

function setUpRun(options: { logsFileExists: boolean }): void {
    transactionMock.mockImplementation(async (operation: (manager: unknown) => Promise<unknown>) =>
        operation({ getRepository: () => fileRepositoryMock }))
    flowRunRepoMock.findOneBy.mockResolvedValue({ id: 'run-1' })
    flowRunRepoMock.findOneByOrFail.mockResolvedValue({ id: 'run-1' })
    flowRunRepoMock.update.mockResolvedValue(undefined)
    fileRepositoryMock.findOneBy.mockResolvedValue(options.logsFileExists ? { id: 'file-1' } : null)
}

describe('persistRunMetadataAndPassgradOutbox', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('keeps the terminal status when the logs file no longer exists', async () => {
        setUpRun({ logsFileExists: false })

        await persistRunMetadataAndPassgradOutbox(
            {
                runId: 'run-1',
                projectId: 'project-1',
                status: 'FAILED' as never,
                logsFileId: 'file-pruned',
                finishTime: '2026-10-28T03:24:52.000Z',
                stepsCount: 1,
            } as never,
            log,
        )

        expect(flowRunRepoMock.update).toHaveBeenCalledTimes(1)
        const [runId, patch] = flowRunRepoMock.update.mock.calls[0]
        expect(runId).toBe('run-1')
        expect(patch.status).toBe('FAILED')
        expect(patch.finishTime).toBe('2026-10-28T03:24:52.000Z')
        expect(patch).not.toHaveProperty('logsFileId')
    })

    it('writes the logs file when the file row still exists', async () => {
        setUpRun({ logsFileExists: true })

        await persistRunMetadataAndPassgradOutbox(
            {
                runId: 'run-1',
                projectId: 'project-1',
                status: 'FAILED' as never,
                logsFileId: 'file-1',
                finishTime: '2026-10-28T03:24:52.000Z',
                stepsCount: 1,
            } as never,
            log,
        )

        expect(flowRunRepoMock.update.mock.calls[0][1].logsFileId).toBe('file-1')
    })
})
