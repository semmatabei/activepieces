import {
    ActivepiecesError,
    apId,
    ErrorCode,
    isNil,
} from '@activepieces/shared'
import { repoFactory } from '../core/db/repo-factory'
import { encryptUtils } from '../helper/encryption'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import {
    PassgradProjectBindingEntity,
    PassgradProjectBindingSchema,
    PassgradProjectBindingStatus,
} from './passgrad-project-binding.entity'

export const passgradProjectBindingRepo = repoFactory(
    PassgradProjectBindingEntity,
)

export const passgradProjectBindingService = {
    async get(projectId: string): Promise<PassgradProjectBindingSchema | null> {
        return passgradProjectBindingRepo().findOne({
            where: { projectId },
            relations: { project: true },
        })
    },
    async getActive(
        projectId: string,
    ): Promise<PassgradProjectBindingSchema | null> {
        const binding = await passgradProjectBindingRepo().findOne({
            where: { projectId, status: PassgradProjectBindingStatus.ACTIVE },
            relations: { project: true },
        })
        if (!isValidActiveBinding(binding)) return null
        return binding
    },
    async createOrGet(
        params: CreatePassgradProjectBindingParams,
    ): Promise<CreatePassgradProjectBindingResult> {
        const existing = await findByProjectOrTenant(
            params.projectId,
            params.tenantId,
        )
        if (!isNil(existing)) {
            assertSameBinding(existing, params)
            return { binding: existing, created: false }
        }

        const binding = {
            id: apId(),
            created: new Date(),
            updated: new Date(),
            projectId: params.projectId,
            provisioningKey: params.provisioningKey,
            tenantId: params.tenantId,
            credentials: await encryptUtils.encryptObject({
                callbackSecret: params.callbackSecret,
                credentialId: params.credentialId,
            }),
            status: PassgradProjectBindingStatus.ACTIVE,
            revokedAt: null,
        } satisfies Omit<PassgradProjectBindingSchema, 'project'>
        await passgradProjectBindingRepo()
            .createQueryBuilder()
            .insert()
            .values(binding)
            .orIgnore()
            .execute()

        const saved = await findByProjectOrTenant(
            params.projectId,
            params.tenantId,
        )
        if (isNil(saved)) {
            throw new Error('Passgrad project binding was not persisted')
        }
        assertSameBinding(saved, params)
        return { binding: saved, created: saved.id === binding.id }
    },

    async revoke(params: RevokePassgradProjectBindingParams): Promise<void> {
        const binding = await passgradProjectBindingRepo().findOneBy({
            projectId: params.projectId,
        })
        if (
            isNil(binding) ||
      binding.tenantId !== params.tenantId ||
      binding.provisioningKey !== params.provisioningKey
        ) {
            throw new ActivepiecesError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'Passgrad binding is not valid' },
            })
        }
        if (binding.status === PassgradProjectBindingStatus.REVOKED) return
        await passgradProjectBindingRepo().update(binding.id, {
            status: PassgradProjectBindingStatus.REVOKED,
            revokedAt: new Date(),
            updated: new Date(),
        })
    },

    async synchronize(
        params: CreatePassgradProjectBindingParams,
    ): Promise<CreatePassgradProjectBindingResult> {
        const existing = await findByProjectOrTenant(
            params.projectId,
            params.tenantId,
        )
        if (
            !isNil(existing) &&
      existing.status === PassgradProjectBindingStatus.REVOKED
        ) {
            throw new ActivepiecesError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'Passgrad binding has been revoked' },
            })
        }
        if (!isNil(existing)) {
            assertSameBinding(existing, params)
            const credentials = await encryptUtils.encryptObject({
                callbackSecret: params.callbackSecret,
                credentialId: params.credentialId,
            })
            const result = await passgradProjectBindingRepo().update(
                { id: existing.id, status: PassgradProjectBindingStatus.ACTIVE },
                { credentials, updated: new Date() },
            )
            if (result.affected !== 1) {
                throw new ActivepiecesError({
                    code: ErrorCode.AUTHORIZATION,
                    params: { message: 'Passgrad binding is no longer active' },
                })
            }
            const binding = await findByProjectOrTenant(params.projectId, params.tenantId)
            if (isNil(binding)) throw new Error('Passgrad project binding was not persisted')
            return { binding, created: false }
        }
        return passgradProjectBindingService.createOrGet(params)
    },

    async getCredentials(
        projectId: string,
    ): Promise<PassgradProjectBindingCredentialsWithTenant | null> {
        const binding = await passgradProjectBindingRepo().findOne({
            where: { projectId },
            relations: { project: true },
        })
        if (
            isNil(binding) ||
      isNil(binding.project) ||
      binding.project.id !== projectId ||
      binding.project.externalId !== binding.tenantId ||
      binding.project.platformId !==
        system.get(AppSystemProp.PASSGRAD_PLATFORM_ID) ||
      binding.status !== PassgradProjectBindingStatus.ACTIVE ||
      !isNil(binding.project.deleted)
        ) {
            return null
        }
        const credentials =
      await encryptUtils.decryptObject<PassgradProjectBindingCredentials>(
          binding.credentials,
      )
        return { ...credentials, tenantId: binding.tenantId }
    },
}

async function findByProjectOrTenant(
    projectId: string,
    tenantId: string,
): Promise<PassgradProjectBindingSchema | null> {
    return passgradProjectBindingRepo().findOne({
        where: [{ projectId }, { tenantId }],
    })
}

function assertSameBinding(
    existing: PassgradProjectBindingSchema,
    params: CreatePassgradProjectBindingParams,
): void {
    if (
        existing.projectId === params.projectId &&
    existing.tenantId === params.tenantId &&
    existing.provisioningKey === params.provisioningKey
    ) {
        return
    }
    throw new ActivepiecesError({
        code: ErrorCode.VALIDATION,
        params: { message: 'Passgrad project or tenant is already bound' },
    })
}

export type PassgradProjectBindingCredentials = {
    callbackSecret: string
    credentialId: string
}

export type PassgradProjectBindingCredentialsWithTenant =
  PassgradProjectBindingCredentials & {
      tenantId: string
  }

type CreatePassgradProjectBindingParams = PassgradProjectBindingCredentials & {
    projectId: string
    provisioningKey: string
    tenantId: string
}

type CreatePassgradProjectBindingResult = {
    binding: PassgradProjectBindingSchema
    created: boolean
}

type RevokePassgradProjectBindingParams = {
    projectId: string
    tenantId: string
    provisioningKey: string
}

function isValidActiveBinding(
    binding: PassgradProjectBindingSchema | null,
): binding is PassgradProjectBindingSchema {
    return (
        !isNil(binding) &&
    !isNil(binding.project) &&
    binding.status === PassgradProjectBindingStatus.ACTIVE &&
    binding.project.id === binding.projectId &&
    binding.project.externalId === binding.tenantId &&
    binding.project.platformId ===
      system.get(AppSystemProp.PASSGRAD_PLATFORM_ID) &&
    isNil(binding.project.deleted)
    )
}
