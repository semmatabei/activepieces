import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    repo: {
        findOne: vi.fn(),
        findOneBy: vi.fn(),
        update: vi.fn(),
        createQueryBuilder: vi.fn(),
    },
    decryptObject: vi.fn(),
    encryptObject: vi.fn(),
    systemGet: vi.fn(),
}))

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: () => () => mocks.repo,
}))
vi.mock('../../../../src/app/helper/encryption', () => ({
    encryptUtils: {
        decryptObject: mocks.decryptObject,
        encryptObject: mocks.encryptObject,
    },
}))
vi.mock('../../../../src/app/helper/system/system', () => ({
    system: {
        get: mocks.systemGet,
    },
}))

import { passgradProjectBindingService } from '../../../../src/app/passgrad/passgrad-project-binding.service'

describe('passgradProjectBindingService.getCredentials', () => {
    beforeEach(() => {
        mocks.repo.findOne.mockReset()
        mocks.decryptObject.mockReset()
        mocks.encryptObject.mockReset()
        mocks.repo.update.mockReset()
        mocks.systemGet.mockReturnValue('platform-1')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it.each([
        { project: undefined, tenantId: 'tenant-1', status: 'ACTIVE' },
        {
            project: {
                id: 'project-1',
                externalId: 'tenant-1',
                platformId: 'platform-1',
                deleted: null,
            },
            tenantId: 'tenant-1',
            status: 'REVOKED',
        },
        {
            project: {
                id: 'other-project',
                externalId: 'tenant-1',
                platformId: 'platform-1',
                deleted: null,
            },
            tenantId: 'tenant-1',
        },
        {
            project: {
                id: 'project-1',
                externalId: 'other-tenant',
                platformId: 'platform-1',
                deleted: null,
            },
            tenantId: 'tenant-1',
        },
        {
            project: {
                id: 'project-1',
                externalId: 'tenant-1',
                platformId: 'other-platform',
                deleted: null,
            },
            tenantId: 'tenant-1',
        },
        {
            project: {
                id: 'project-1',
                externalId: 'tenant-1',
                platformId: 'platform-1',
                deleted: new Date(),
            },
            tenantId: 'tenant-1',
        },
    ])('fails closed for invalid binding state', async (binding) => {
        mocks.repo.findOne.mockResolvedValue({
            projectId: 'project-1',
            tenantId: binding.tenantId,
            credentials: { iv: 'iv', data: 'data' },
            status: binding.status,
            project: binding.project,
        })

        await expect(
            passgradProjectBindingService.getCredentials('project-1'),
        ).resolves.toBeNull()
        expect(mocks.decryptObject).not.toHaveBeenCalled()
    })

    it('decrypts credentials only after binding integrity checks pass', async () => {
        mocks.repo.findOne.mockResolvedValue({
            projectId: 'project-1',
            tenantId: 'tenant-1',
            credentials: { iv: 'iv', data: 'data' },
            status: 'ACTIVE',
            project: {
                id: 'project-1',
                externalId: 'tenant-1',
                platformId: 'platform-1',
                deleted: null,
            },
        })
        mocks.decryptObject.mockResolvedValue({
            callbackSecret: 'secret',
            credentialId: 'credential',
        })

        await expect(
            passgradProjectBindingService.getCredentials('project-1'),
        ).resolves.toEqual({
            callbackSecret: 'secret',
            credentialId: 'credential',
            tenantId: 'tenant-1',
        })
        expect(mocks.decryptObject).toHaveBeenCalledTimes(1)
    })

    it('synchronizes rotated encrypted credentials without changing binding identity', async () => {
        const existing = {
            id: 'binding-1',
            projectId: 'project-1',
            tenantId: 'tenant-1',
            provisioningKey: 'key-1',
            status: 'ACTIVE',
            credentials: { iv: 'old-iv', data: 'old-data' },
        }
        const updated = { ...existing, credentials: { iv: 'new-iv', data: 'new-data' } }
        mocks.repo.findOne
            .mockResolvedValueOnce(existing)
            .mockResolvedValueOnce(updated)
            .mockResolvedValueOnce({ ...updated, project: { id: 'project-1', externalId: 'tenant-1', platformId: 'platform-1', deleted: null } })
        mocks.encryptObject.mockResolvedValue(updated.credentials)
        mocks.repo.update.mockResolvedValue({ affected: 1 })
        mocks.decryptObject.mockResolvedValue({ callbackSecret: 'new-secret', credentialId: 'new-credential' })

        const result = await passgradProjectBindingService.synchronize({
            projectId: 'project-1', tenantId: 'tenant-1', provisioningKey: 'key-1',
            callbackSecret: 'new-secret', credentialId: 'new-credential',
        })

        expect(result.created).toBe(false)
        expect(result.binding.id).toBe('binding-1')
        expect(mocks.repo.update).toHaveBeenCalledWith(
            { id: 'binding-1', status: 'ACTIVE' },
            { credentials: updated.credentials, updated: expect.any(Date) },
        )
        await expect(passgradProjectBindingService.getCredentials('project-1')).resolves.toMatchObject({
            callbackSecret: 'new-secret', credentialId: 'new-credential', tenantId: 'tenant-1',
        })
    })

    it('keeps concurrent synchronization updates on the same binding identity', async () => {
        const existing = {
            id: 'binding-1',
            projectId: 'project-1',
            tenantId: 'tenant-1',
            provisioningKey: 'key-1',
            status: 'ACTIVE',
            credentials: { iv: 'old-iv', data: 'old-data' },
        }
        mocks.repo.findOne.mockResolvedValue(existing)
        mocks.repo.update.mockResolvedValue({ affected: 1 })
        mocks.repo.findOne.mockResolvedValue(existing)
        mocks.encryptObject.mockImplementation(async (credentials) => credentials)

        await Promise.all([
            passgradProjectBindingService.synchronize({
                projectId: 'project-1', tenantId: 'tenant-1', provisioningKey: 'key-1',
                callbackSecret: 'secret-a', credentialId: 'credential-a',
            }),
            passgradProjectBindingService.synchronize({
                projectId: 'project-1', tenantId: 'tenant-1', provisioningKey: 'key-1',
                callbackSecret: 'secret-b', credentialId: 'credential-b',
            }),
        ])

        expect(mocks.repo.update).toHaveBeenCalledTimes(2)
        expect(mocks.repo.update.mock.calls).toEqual([
            [
                { id: 'binding-1', status: 'ACTIVE' },
                { credentials: { callbackSecret: 'secret-a', credentialId: 'credential-a' }, updated: expect.any(Date) },
            ],
            [
                { id: 'binding-1', status: 'ACTIVE' },
                { credentials: { callbackSecret: 'secret-b', credentialId: 'credential-b' }, updated: expect.any(Date) },
            ],
        ])
    })
})
