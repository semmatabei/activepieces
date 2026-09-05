import { createHash, timingSafeEqual } from 'crypto'
import { cryptoUtils } from '@activepieces/server-utils'
import {
    ActivepiecesError,
    DefaultProjectRole,
    ErrorCode,
    isNil,
    PlatformRole,
    PrincipalType,
    Project,
    ProjectType,
    UserIdentityProvider,
    UserStatus,
} from '@activepieces/shared'
import dayjs from 'dayjs'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { accessTokenManager } from '../authentication/lib/access-token-manager'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { distributedLock } from '../database/redis-connections'
import { projectMemberService } from '../ee/projects/project-members/project-member.service'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { platformService } from '../platform/platform.service'
import { projectService } from '../project/project-service'
import { UserSchema } from '../user/user-entity'
import { userRepo } from '../user/user-service'
import {
    passgradCapabilityAuthService,
    resolvePassgradTrustedExecutionPath,
} from './passgrad-capability-auth.service'
import { passgradCapabilityService } from './passgrad-capability.service'
import { passgradEmbedSessionMintService } from './passgrad-embed-session-mint.service'
import { passgradEngineRequestSchema } from './passgrad-engine-request.schema'
import { passgradLifecycleOutboxService } from './passgrad-lifecycle-outbox.service'
import { passgradProjectBindingService } from './passgrad-project-binding.service'
import { passgradResourceIdSchema } from './passgrad-resource-id'

export const passgradInternalModule: FastifyPluginAsyncZod = async (app) => {
    app.post('/projects', projectRequestOptions, async (request) => {
        assertGatewaySecret(request.headers['x-passgrad-provisioning-secret'])
        const project = await getOrCreateProject({
            tenantId: request.body.tenantId,
            displayName: request.body.displayName,
            log: request.log,
        })
        return { projectId: project.id }
    })

    app.post(
        '/projects/:projectId/binding/synchronize',
        bindingRequestOptions,
        async (request, reply) => {
            assertGatewaySecret(request.headers['x-passgrad-provisioning-secret'])
            await assertBindingProject(
                request.params.projectId,
                request.body.tenantId,
            )
            await passgradProjectBindingService.synchronize({
                projectId: request.params.projectId,
                tenantId: request.body.tenantId,
                provisioningKey: request.body.provisioningKey,
                credentialId: request.body.credentialId,
                callbackSecret: request.body.callbackSecret,
            })
            return reply.code(204).send()
        },
    )

    app.post(
        '/projects/:projectId/binding/revoke',
        revokeBindingRequestOptions,
        async (request, reply) => {
            assertGatewaySecret(request.headers['x-passgrad-provisioning-secret'])
            await passgradProjectBindingService.revoke({
                projectId: request.params.projectId,
                tenantId: request.body.tenantId,
                provisioningKey: request.body.provisioningKey,
            })
            return reply.code(204).send()
        },
    )

    app.post('/embed-sessions', requestOptions, async (request) => {
        assertGatewaySecret(request.headers['x-passgrad-provisioning-secret'])
        const binding = await passgradProjectBindingService.getActive(
            request.body.projectId,
        )
        if (
            isNil(binding) ||
      binding.provisioningKey !== request.body.provisioningKey
        ) {
            throw unauthorized()
        }
        const mint = await passgradEmbedSessionMintService.createOrGet({
            projectId: request.body.projectId,
            passgradUserId: request.body.userId,
            idempotencyKey: request.body.idempotencyKey,
        })
        const user = await getOrCreateEmbedUser({
            apUserId: mint.apUserId,
            passgradUserId: mint.passgradUserId,
            platformId: binding.project?.platformId,
        })
        await projectMemberService(request.log).upsert({
            projectId: binding.projectId,
            userId: user.id,
            projectRoleName: DefaultProjectRole.EDITOR,
        })
        const identity = await userIdentityService(request.log).getOneOrFail({
            id: user.identityId,
        })
        const expiresInSeconds = dayjs.duration(5, 'minute').asSeconds()
        const accessToken = await accessTokenManager(request.log).generateToken(
            {
                id: user.id,
                type: PrincipalType.USER,
                platform: { id: user.platformId! },
                projectId: binding.projectId,
                tokenVersion: identity.tokenVersion,
            },
            expiresInSeconds,
        )
        return {
            accessToken,
            expiresAt: dayjs().add(expiresInSeconds, 'second').toISOString(),
            projectId: binding.projectId,
        }
    })

    app.post('/engine/request', engineRequestOptions, async (request) => {
        const claims =
      await passgradCapabilityAuthService.verifyAuthorizationHeader(
          request.headers.authorization,
      )
        const executionPath = resolvePassgradTrustedExecutionPath({
            invocationType: claims.invocationType,
            executionPath: request.body.executionPath,
        })
        return passgradCapabilityService.request({
            projectId: claims.projectId,
            pieceName: claims.pieceName,
            operation: request.body.operation,
            resourceId: request.body.resourceId,
            payload: request.body.payload,
            ...(claims.invocationType === 'execution' && !isNil(executionPath)
                ? {
                    execution: {
                        runId: claims.flowRunId,
                        stepId: claims.stepName,
                        executionPath,
                        sourceSubmissionId: claims.sourceSubmissionId,
                    },
                }
                : {}),
        })
    })

    app.post(
        '/lifecycle-outbox/:id/replay',
        replayLifecycleOutboxRequestOptions,
        async (request, reply) => {
            assertGatewaySecret(request.headers['x-passgrad-provisioning-secret'])
            await passgradLifecycleOutboxService(request.log).replayDeadLetter(
                request.params.id,
            )
            return reply.code(204).send()
        },
    )
}

async function assertBindingProject(
    projectId: string,
    tenantId: string,
): Promise<void> {
    const project = await projectService(system.globalLogger()).getOneOrThrow(
        projectId,
    )
    if (
        project.platformId !==
      requiredSystemProp(AppSystemProp.PASSGRAD_PLATFORM_ID) ||
    project.externalId !== tenantId
    ) {
        throw unauthorized()
    }
}

async function getOrCreateProject(params: {
    tenantId: string
    displayName: string
    log: import('fastify').FastifyBaseLogger
}) {
    let result: Project | undefined
    const platformId = requiredSystemProp(AppSystemProp.PASSGRAD_PLATFORM_ID)
    await distributedLock(params.log).runExclusive({
        key: `passgrad-project:${platformId}:${params.tenantId}`,
        timeoutInSeconds: 30,
        fn: async () => {
            const existing = await projectService(
                params.log,
            ).getByPlatformIdAndExternalId({
                platformId,
                externalId: params.tenantId,
            })
            if (!isNil(existing)) {
                result = existing
                return
            }
            const platform = await platformService(params.log).getOneOrThrow(
                platformId,
            )
            result = await projectService(params.log).create({
                displayName: params.displayName,
                ownerId: platform.ownerId,
                platformId,
                type: ProjectType.TEAM,
                externalId: params.tenantId,
            })
        },
    })
    if (isNil(result)) throw new Error('Passgrad project was not created')
    return result
}

async function getOrCreateEmbedUser(params: {
    apUserId: string
    passgradUserId: string
    platformId: string | undefined
}) {
    if (isNil(params.platformId)) throw unauthorized()
    const platformUser = await userRepo().findOneBy({
        platformId: params.platformId,
        externalId: params.passgradUserId,
    })
    if (!isNil(platformUser)) return platformUser
    const existing = await userRepo().findOneBy({ id: params.apUserId })
    if (!isNil(existing)) return existing
    const email = `${createHash('sha256')
        .update(params.apUserId)
        .digest('hex')}@passgrad.invalid`
    let identity = await userIdentityService(
        system.globalLogger(),
    ).getIdentityByEmail(email)
    if (isNil(identity)) {
        identity = await userIdentityService(system.globalLogger()).create({
            email,
            password: await cryptoUtils.generateRandomPassword(),
            firstName: 'Passgrad',
            lastName: 'Member',
            trackEvents: false,
            newsLetter: false,
            provider: UserIdentityProvider.JWT,
            verified: true,
        })
    }
    const created = new Date().toISOString()
    const newUser = {
        id: params.apUserId,
        identityId: identity.id,
        platformId: params.platformId,
        externalId: params.passgradUserId,
        platformRole: PlatformRole.MEMBER,
        status: UserStatus.ACTIVE,
        created,
        updated: created,
    } satisfies Omit<UserSchema, 'projects' | 'identity' | 'badges'>
    return userRepo().save(newUser)
}

function assertGatewaySecret(header: string | string[] | undefined): void {
    const provided = Array.isArray(header) ? undefined : header
    const expected = system.get(AppSystemProp.PASSGRAD_PROVISIONING_SECRET)
    if (
        isNil(provided) ||
    isNil(expected) ||
    Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    )
        throw unauthorized()
}

function unauthorized(): ActivepiecesError {
    return new ActivepiecesError({
        code: ErrorCode.AUTHENTICATION,
        params: { message: 'Unauthorized' },
    })
}

function requiredSystemProp(prop: AppSystemProp): string {
    const value = system.get(prop)
    if (isNil(value))
        throw new ActivepiecesError({
            code: ErrorCode.SYSTEM_PROP_INVALID,
            params: { prop },
        })
    return value
}

const requestOptions = {
    config: { security: securityAccess.public() },
    schema: {
        body: z.object({
            projectId: z.string().min(1),
            userId: z.string().uuid(),
            idempotencyKey: z.string().uuid(),
            provisioningKey: z.string().uuid(),
        }),
    },
}
const projectRequestOptions = {
    config: { security: securityAccess.public() },
    schema: {
        body: z.object({
            tenantId: z.string().uuid(),
            displayName: z.string().trim().min(1).max(255),
            idempotencyKey: z.string().uuid(),
        }),
    },
}
const bindingRequestOptions = {
    config: { security: securityAccess.public() },
    schema: {
        params: z.object({ projectId: z.string().min(1) }),
        body: z.object({
            tenantId: z.string().uuid(),
            provisioningKey: z.string().uuid(),
            // Passgrad S1-10 issues binding credential IDs as opaque resource IDs.
            credentialId: passgradResourceIdSchema,
            callbackSecret: z.string().min(32).max(4096),
        }),
    },
}
const engineRequestOptions = {
    config: { security: securityAccess.public() },
    schema: {
        body: passgradEngineRequestSchema,
    },
}

const replayLifecycleOutboxRequestOptions = {
    config: { security: securityAccess.public() },
    schema: {
        params: z.object({ id: z.string().min(1) }),
    },
}

const revokeBindingRequestOptions = {
    config: { security: securityAccess.public() },
    schema: {
        params: z.object({ projectId: z.string().min(1) }),
        body: z
            .object({
                tenantId: z.string().uuid(),
                provisioningKey: z.string().uuid(),
            })
            .strict(),
    },
}
