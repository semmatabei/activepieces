import { ActivepiecesError, ErrorCode, Permission, PrincipalType } from '@activepieces/shared'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    getOneOrThrow: vi.fn(),
    getRole: vi.fn(),
    getOneOrThrowById: vi.fn(),
    getEdition: vi.fn(),
}))

vi.mock('../../../../../../src/app/project/project-service', () => ({
    projectService: () => ({
        getOneOrThrow: mocks.getOneOrThrow,
    }),
}))
vi.mock('../../../../../../src/app/ee/projects/project-members/project-member.service', () => ({
    projectMemberService: () => ({
        getRole: mocks.getRole,
    }),
}))
vi.mock('../../../../../../src/app/ee/projects/project-role/project-role.service', () => ({
    projectRoleService: {
        getOneOrThrowById: mocks.getOneOrThrowById,
    },
}))
vi.mock('../../../../../../src/app/helper/system/system', () => ({
    system: {
        getEdition: mocks.getEdition,
    },
}))

import { rbacService } from '../../../../../../src/app/ee/authentication/project-role/rbac-service'

const PLATFORM_ID = 'platform-passgrad'
const OTHER_PLATFORM_ID = 'platform-someone-else'
const PROJECT_ID = 'project-tenant-a'
const SIBLING_PROJECT_ID = 'project-tenant-b'
const FOREIGN_PROJECT_ID = 'project-other-platform'

const mockLog = {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    level: 'info',
} as never

const servicePrincipal = {
    id: 'service-api-key',
    type: PrincipalType.SERVICE,
    platform: {
        id: PLATFORM_ID,
    },
} as const

const projectOnPlatform = (projectId: string, platformId: string) => ({
    id: projectId,
    platformId,
    displayName: projectId,
})

describe('rbacService.assertPrinicpalAccessToProject for a platform service principal', () => {
    beforeAll(() => {
        mocks.getEdition.mockReturnValue('ee')
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it.each([PROJECT_ID, SIBLING_PROJECT_ID])(
        'grants access to %s when it belongs to the principal\'s platform',
        async (projectId) => {
            mocks.getOneOrThrow.mockResolvedValue(projectOnPlatform(projectId, PLATFORM_ID))

            await expect(
                rbacService(mockLog).assertPrinicpalAccessToProject({
                    principal: servicePrincipal,
                    permission: Permission.WRITE_FLOW,
                    projectId,
                }),
            ).resolves.toBeUndefined()

            expect(mocks.getOneOrThrow).toHaveBeenCalledWith(projectId)
            expect(mocks.getRole).not.toHaveBeenCalled()
            expect(mocks.getOneOrThrowById).not.toHaveBeenCalled()
        },
    )

    it('checks the caller-supplied projectId, not a project bound to the principal', async () => {
        mocks.getOneOrThrow.mockImplementation(async (projectId: string) =>
            projectOnPlatform(projectId, PLATFORM_ID),
        )

        for (const projectId of [PROJECT_ID, SIBLING_PROJECT_ID]) {
            await rbacService(mockLog).assertPrinicpalAccessToProject({
                principal: servicePrincipal,
                permission: Permission.WRITE_FLOW,
                projectId,
            })
        }

        expect(mocks.getOneOrThrow.mock.calls).toEqual([[PROJECT_ID], [SIBLING_PROJECT_ID]])
    })

    it('rejects a project belonging to a different platform', async () => {
        mocks.getOneOrThrow.mockResolvedValue(projectOnPlatform(FOREIGN_PROJECT_ID, OTHER_PLATFORM_ID))

        const error = await rbacService(mockLog)
            .assertPrinicpalAccessToProject({
                principal: servicePrincipal,
                permission: Permission.WRITE_FLOW,
                projectId: FOREIGN_PROJECT_ID,
            })
            .catch((e: unknown) => e)

        expect(error).toBeInstanceOf(ActivepiecesError)
        expect((error as ActivepiecesError).error.code).toBe(ErrorCode.AUTHORIZATION)
        expect((error as ActivepiecesError).error.params).toMatchObject({
            message: 'Service is not allowed to access this project',
            projectId: FOREIGN_PROJECT_ID,
            platformId: PLATFORM_ID,
        })
    })
})
