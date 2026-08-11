import { ActivepiecesError, apId, ErrorCode, isNil } from '@activepieces/shared'
import { repoFactory } from '../core/db/repo-factory'
import { encryptUtils } from '../helper/encryption'
import { PassgradProjectBindingEntity, PassgradProjectBindingSchema } from './passgrad-project-binding.entity'

export const passgradProjectBindingRepo = repoFactory(PassgradProjectBindingEntity)

export const passgradProjectBindingService = {
    async get(projectId: string): Promise<PassgradProjectBindingSchema | null> {
        return passgradProjectBindingRepo().findOne({ where: { projectId }, relations: { project: true } })
    },
    async createOrGet(params: CreatePassgradProjectBindingParams): Promise<CreatePassgradProjectBindingResult> {
        const existing = await findByProjectOrTenant(params.projectId, params.tenantId)
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
        } satisfies Omit<PassgradProjectBindingSchema, 'project'>
        await passgradProjectBindingRepo().createQueryBuilder()
            .insert()
            .values(binding)
            .orIgnore()
            .execute()

        const saved = await findByProjectOrTenant(params.projectId, params.tenantId)
        if (isNil(saved)) {
            throw new Error('Passgrad project binding was not persisted')
        }
        assertSameBinding(saved, params)
        return { binding: saved, created: saved.id === binding.id }
    },

    async getCredentials(projectId: string): Promise<PassgradProjectBindingCredentialsWithTenant | null> {
        const binding = await passgradProjectBindingRepo().findOneBy({ projectId })
        if (isNil(binding)) {
            return null
        }
        const credentials = await encryptUtils.decryptObject<PassgradProjectBindingCredentials>(binding.credentials)
        return { ...credentials, tenantId: binding.tenantId }
    },
}

async function findByProjectOrTenant(projectId: string, tenantId: string): Promise<PassgradProjectBindingSchema | null> {
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

export type PassgradProjectBindingCredentialsWithTenant = PassgradProjectBindingCredentials & {
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
