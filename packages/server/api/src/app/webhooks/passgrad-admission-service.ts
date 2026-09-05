import { safeHttp } from '@activepieces/server-utils'
import { ActivepiecesError, ErrorCode, PassgradRunContext, RunEnvironment, tryCatch, WorkflowAdmission } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { passgradProjectBindingService } from '../passgrad/passgrad-project-binding.service'
import { PassgradTriggerKind } from './passgrad-trigger-kind'

const admissionResponseSchema = z.object({
    admissionToken: z.string().min(1),
    expiresAt: z.string(),
    sourceSubmissionId: z.string().nullable(),
    workflowId: z.string(),
})

const bindingResponseSchema = z.object({
    bound: z.literal(true),
})

const runContextResponseSchema = z.object({
    sourceSubmissionId: z.string().nullable(),
    workflowId: z.string(),
    triggerKind: z.string(),
})

export const passgradAdmissionService = {
    async admit({ allowTesting = false, flowId, invocationId, logger, projectId, runEnvironment, sourceSubmissionId, triggerKind }: AdmitParams): Promise<AdmissionResult> {
        if (runEnvironment !== RunEnvironment.PRODUCTION && !allowTesting) {
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
            sourceSubmissionId,
            triggerKind,
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
                sourceSubmissionId: parsed.data.sourceSubmissionId,
                token: parsed.data.admissionToken,
                workflowId: parsed.data.workflowId,
                triggerKind,
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

    async recover({ flowRunId, logger, projectId }: RecoverParams): Promise<PassgradRunContext | undefined> {
        const binding = await passgradProjectBindingService.getCredentials(projectId)
        if (!binding) return undefined
        const url = system.get(AppSystemProp.PASSGRAD_ADMISSION_URL)
        const secret = system.get(AppSystemProp.PASSGRAD_ADMISSION_SECRET)
        if (!url || !secret) {
            throw unavailable('Passgrad workflow context recovery is unavailable')
        }
        const { data: response, error } = await tryCatch(() => safeHttp.axios.post<unknown>(`${url}/context`, {
            apProjectId: projectId,
            apRunId: flowRunId,
        }, {
            headers: { 'x-passgrad-admission-secret': secret },
            timeout: 3_000,
        }))
        if (error !== null) {
            if (responseStatus(error) === 404) return undefined
            logger.warn({ flowRun: { id: flowRunId }, project: { id: projectId } }, 'Passgrad workflow context recovery failed')
            throw unavailable('Passgrad workflow context recovery failed')
        }
        const parsed = runContextResponseSchema.safeParse(response.data)
        if (!parsed.success) throw unavailable('Passgrad workflow context is invalid')
        return parsed.data
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

function responseStatus(error: unknown): number | undefined {
    const parsed = z.object({ response: z.object({ status: z.number() }).optional() }).safeParse(error)
    return parsed.success ? parsed.data.response?.status : undefined
}

function unavailable(message: string): ActivepiecesError {
    return new ActivepiecesError({ code: ErrorCode.GENERIC_ERROR, params: { message } })
}

type AdmitParams = {
    allowTesting?: boolean
    flowId: string
    invocationId: string
    logger: FastifyBaseLogger
    projectId: string
    runEnvironment: RunEnvironment
    sourceSubmissionId: string | null
    triggerKind: PassgradTriggerKind
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

type RecoverParams = {
    flowRunId: string
    logger: FastifyBaseLogger
    projectId: string
}
