import { safeHttp } from '@activepieces/server-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { system } from '../../../../src/app/helper/system/system'
import { passgradCapabilityService } from '../../../../src/app/passgrad/passgrad-capability.service'
import { passgradProjectBindingService } from '../../../../src/app/passgrad/passgrad-project-binding.service'

describe('passgradCapabilityService', () => {
    beforeEach(() => {
        vi.spyOn(safeHttp.axios, 'request').mockReset()
        vi.spyOn(system, 'get').mockReturnValue('https://api.passgrad.test/v1')
        vi.spyOn(passgradProjectBindingService, 'getCredentials').mockResolvedValue({
            tenantId: 'tenant-from-binding', credentialId: 'credential-from-binding', callbackSecret: 'server-only-secret',
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('uses engine project binding and server-derived Passgrad URL', async () => {
        vi.mocked(safeHttp.axios.request).mockResolvedValue({ data: { record: { id: 'record-1' } } })

        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-table',
            operation: 'table.create-record',
            resourceId: 'table-1',
            payload: { values: { title: 'safe' }, url: 'https://attacker.invalid' },
        })

        expect(passgradProjectBindingService.getCredentials).toHaveBeenCalledWith('engine-project')
        expect(safeHttp.axios.request).toHaveBeenCalledWith(expect.objectContaining({
            url: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/tables/table-1/records',
            headers: expect.objectContaining({
                'x-passgrad-binding-credential-id': 'credential-from-binding',
                'x-passgrad-binding-project-id': 'engine-project',
            }),
        }))
    })

    it('rejects engine project without a persisted binding', async () => {
        vi.mocked(passgradProjectBindingService.getCredentials).mockResolvedValue(null)

        await expect(passgradCapabilityService.request({
            projectId: 'wrong-engine-project',
            pieceName: '@activepieces/piece-passgrad-table',
            operation: 'table.list-records',
            resourceId: 'table-1',
        })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })

        expect(safeHttp.axios.request).not.toHaveBeenCalled()
    })

    it('rejects an operation outside the capability piece allowlist', async () => {
        await expect(passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'table.list-records',
            resourceId: 'table-1',
        })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })

        expect(passgradProjectBindingService.getCredentials).not.toHaveBeenCalled()
        expect(safeHttp.axios.request).not.toHaveBeenCalled()
    })
})
