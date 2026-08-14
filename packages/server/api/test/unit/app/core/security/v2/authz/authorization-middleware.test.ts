import { PrincipalType } from '@activepieces/shared'
import { FastifyRequest } from 'fastify'
import { describe, expect, it } from 'vitest'
import { securityAccess } from '../../../../../../../src/app/core/security/authorization/fastify-security'
import { convertToSecurityAccessRequest } from '../../../../../../../src/app/core/security/v2/authz/authorization-middleware'

describe('convertToSecurityAccessRequest', () => {
    it('preserves project-scoped embed access for unscoped routes', async () => {
        const security = securityAccess.unscoped([PrincipalType.USER], {
            allowProjectScopedEmbed: true,
        })
        const request = {
            routeOptions: { config: { security } },
        } as unknown as FastifyRequest

        await expect(convertToSecurityAccessRequest(request)).resolves.toEqual(
            security,
        )
    })
})
