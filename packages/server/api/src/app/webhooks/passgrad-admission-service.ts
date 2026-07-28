import { safeHttp } from '@activepieces/server-utils'
import { RunEnvironment, tryCatch, WorkflowAdmission } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'

const admissionResponseSchema = z.object({
    admissionToken: z.string().min(1),
    expiresAt: z.string(),
    workflowId: z.string(),
})

const bindingResponseSchema = z.object({
    bound: z.literal(true),
})

export const passgradAdmissionService = {
    async admit({ flowId, invocationId, logger, projectId, runEnvironment }: AdmitParams): Promise<AdmissionResult> {
        if (runEnvironment !== RunEnvironment.PRODUCTION) {
            return { status: 'not_required' }
        }

        const url = system.get(AppSystemProp.PASSGRAD_ADMISSION_URL)
        if (!url) {
            return { status: 'not_configured' }
        }

        const secret = system.get(AppSystemProp.PASSGRAD_ADMISSION_SECRET)
        if (!secret) {
            logger.error('Passgrad admission gateway is configured without a shared secret')
            return { status: 'unavailable' }
        }

        const { data: response, error } = await tryCatch(() => safeHttp.axios.post<unknown>(url, {
            apProjectId: projectId,
            apFlowId: flowId,
            invocationId,
            triggerKind: 'webhook',
        }, {
            headers: {
                'x-passgrad-admission-secret': secret,
            },
            timeout: 3_000,
        }))

        if (error !== null) {
            logger.warn({ flow: { id: flowId }, project: { id: projectId } }, 'Passgrad admission gateway rejected or failed webhook admission')
            return isAdmissionRejection(error) ? { status: 'denied' } : { status: 'unavailable' }
        }

        const parsed = admissionResponseSchema.safeParse(response.data)
        if (!parsed.success) {
            logger.error({ flow: { id: flowId }, project: { id: projectId } }, 'Passgrad admission gateway returned an invalid admission response')
            return { status: 'unavailable' }
        }

        return {
            status: 'admitted',
            admission: {
                invocationId,
                token: parsed.data.admissionToken,
            },
        }
    },

    async bind({ admission, flowRunId, logger, projectId }: BindParams): Promise<boolean> {
        const url = system.get(AppSystemProp.PASSGRAD_ADMISSION_URL)
        const secret = system.get(AppSystemProp.PASSGRAD_ADMISSION_SECRET)
        if (!url || !secret) {
            logger.error({ flowRun: { id: flowRunId } }, 'Passgrad admission binding is unavailable')
            return false
        }
        const { data: response, error } = await tryCatch(() => safeHttp.axios.post<unknown>(`${url}/bind`, {
            apProjectId: projectId,
            apRunId: flowRunId,
            invocationId: admission.invocationId,
        }, {
            headers: {
                'x-passgrad-admission-secret': secret,
                'x-passgrad-workflow-admission-token': admission.token,
            },
            timeout: 3_000,
        }))
        if (error !== null || !bindingResponseSchema.safeParse(response.data).success) {
            logger.warn({ flowRun: { id: flowRunId }, project: { id: projectId } }, 'Passgrad admission gateway rejected workflow run binding')
            return false
        }
        return true
    },
}

function isAdmissionRejection(error: unknown): boolean {
    const parsed = z.object({
        response: z.object({
            status: z.number(),
        }).optional(),
    }).safeParse(error)
    return parsed.success && [401, 403, 409, 429].includes(parsed.data.response?.status ?? 0)
}

type AdmitParams = {
    flowId: string
    invocationId: string
    logger: FastifyBaseLogger
    projectId: string
    runEnvironment: RunEnvironment
}

type AdmissionResult =
    | { status: 'admitted', admission: WorkflowAdmission }
    | { status: 'denied' | 'not_configured' | 'not_required' | 'unavailable' }

type BindParams = {
    admission: WorkflowAdmission
    flowRunId: string
    logger: FastifyBaseLogger
    projectId: string
}
