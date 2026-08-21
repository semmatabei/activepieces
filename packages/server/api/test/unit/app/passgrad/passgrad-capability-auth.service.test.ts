import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtUtils } from '../../../../src/app/helper/jwt-utils'
import { system } from '../../../../src/app/helper/system/system'
import { AppSystemProp } from '../../../../src/app/helper/system/system-props'
import { passgradCapabilityAuthService } from '../../../../src/app/passgrad/passgrad-capability-auth.service'

const secret = 'capability-secret'

describe('passgradCapabilityAuthService', () => {
    beforeEach(() => {
        vi.spyOn(system, 'get').mockImplementation((prop) =>
            prop === AppSystemProp.PASSGRAD_ENGINE_CAPABILITY_SECRET
                ? secret
                : undefined,
        )
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('rejects a generic engine token', async () => {
        const token = await jwtUtils.sign({
            payload: { type: 'ENGINE', projectId: 'project-1' },
            key: secret,
        })
        await expect(
            passgradCapabilityAuthService.verifyAuthorizationHeader(`Bearer ${token}`),
        ).rejects.toMatchObject({
            error: { code: 'AUTHENTICATION' },
        })
    })

    it('rejects expired and malformed capabilities before request handling', async () => {
        const expired = await jwtUtils.sign({
            payload: {
                sub: 'passgrad-engine-capability',
                projectId: 'project-1',
                pieceName: '@activepieces/piece-passgrad-form',
                invocationType: 'execution',
                jti: 'invocation-123456789',
            },
            key: secret,
            expiresInSeconds: -1,
            issuer: 'activepieces-passgrad-engine',
        })
        await expect(
            passgradCapabilityAuthService.verifyAuthorizationHeader(
                `Bearer ${expired}`,
            ),
        ).rejects.toMatchObject({
            error: { code: 'AUTHENTICATION' },
        })
        await expect(
            passgradCapabilityAuthService.verifyAuthorizationHeader(
                'Bearer not-a-jwt',
            ),
        ).rejects.toMatchObject({
            error: { code: 'AUTHENTICATION' },
        })
    })

    it('verifies project, piece, and invocation claims from the credential', async () => {
        const token = await jwtUtils.sign({
            payload: {
                sub: 'passgrad-engine-capability',
                projectId: 'project-1',
                pieceName: '@activepieces/piece-passgrad-form',
                invocationType: 'property',
                jti: 'invocation-123456789',
            },
            key: secret,
            expiresInSeconds: 60,
            issuer: 'activepieces-passgrad-engine',
        })
        await expect(
            passgradCapabilityAuthService.verifyAuthorizationHeader(`Bearer ${token}`),
        ).resolves.toMatchObject({
            projectId: 'project-1',
            pieceName: '@activepieces/piece-passgrad-form',
            invocationType: 'property',
            jti: 'invocation-123456789',
        })
    })
})
