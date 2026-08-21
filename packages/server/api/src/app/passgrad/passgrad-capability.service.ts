import { safeHttp } from '@activepieces/server-utils'
import { ActivepiecesError, ErrorCode, isNil } from '@activepieces/shared'
import { AxiosRequestConfig, isAxiosError, Method } from 'axios'
import { z } from 'zod'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { passgradProjectBindingService } from './passgrad-project-binding.service'

export const passgradCapabilityService = {
    async request(params: PassgradCapabilityRequest): Promise<unknown> {
        assertOperationAllowed(params)
        const binding = await passgradProjectBindingService.getCredentials(
            params.projectId,
        )
        if (isNil(binding)) {
            throw capabilityError('Project is not bound to Passgrad')
        }
        const apiUrl = system.get(AppSystemProp.PASSGRAD_API_URL)
        if (isNil(apiUrl)) {
            throw capabilityError('Passgrad API URL is not configured')
        }
        const route = buildRoute(params)
        try {
            const response = await safeHttp.axios.request({
                method: route.method,
                url: route.callback
                    ? `${apiUrl.replace(/\/$/, '')}${route.path}`
                    : `${apiUrl.replace(/\/$/, '')}/tenants/${encodeURIComponent(binding.tenantId)}${
                        route.path
                    }`,
                headers: {
                    'x-passgrad-binding-credential-id': binding.credentialId,
                    'x-passgrad-binding-project-id': params.projectId,
                    'x-passgrad-binding-secret': binding.callbackSecret,
                    ...(route.callback
                        ? {
                            'x-passgrad-callback-credential-id': binding.credentialId,
                            'x-passgrad-callback-secret': binding.callbackSecret,
                            'x-passgrad-project-id': params.projectId,
                        }
                        : {}),
                },
                data: route.payload,
            } satisfies AxiosRequestConfig)
            return response.data === '' ? { acknowledged: true } : response.data
        }
        catch (error) {
            if (isAxiosError(error)) {
                throw capabilityError('Passgrad capability request failed')
            }
            throw error
        }
    },
}

function buildRoute(params: PassgradCapabilityRequest): PassgradRoute {
    switch (params.operation) {
        case 'form.list':
            return { method: 'GET', path: '/forms' }
        case 'table.get-record':
            return resourceRoute(
                params,
                'GET',
                (id) =>
                    `/tables/${id}/records/${encodeURIComponent(requiredPayloadString(
                        params.payload,
                        'recordId',
                    ))}`,
            )
        case 'table.create-record':
            return resourceRoute(
                params,
                'POST',
                (id) => `/tables/${id}/records`,
                parseRecordPayload(params.payload),
            )
        case 'table.update-record':
            return resourceRoute(
                params,
                'PATCH',
                (id) =>
                    `/tables/${id}/records/${encodeURIComponent(requiredPayloadString(
                        params.payload,
                        'recordId',
                    ))}`,
                { values: parseUpdateRecordPayload(params.payload).values },
            )
        case 'table.create-trigger':
            return resourceRoute(
                params,
                'POST',
                (id) => `/tables/${id}/triggers`,
                parseTriggerPayload(params.payload, true),
            )
        case 'table.delete-trigger':
            return resourceRoute(
                params,
                'DELETE',
                (id) =>
                    `/tables/${id}/triggers/${encodeURIComponent(requiredPayloadString(
                        params.payload,
                        'triggerId',
                    ))}`,
            )
        case 'table.list-records':
            return resourceRoute(
                params,
                'GET',
                (id) => `/tables/${id}/records?limit=1&sort=-created_at`,
            )
        case 'table.list':
            return { method: 'GET', path: '/tables' }
        case 'table.get-fields':
            return resourceRoute(
                params,
                'GET',
                (id) => `/tables/${id}/fields`,
            )
        case 'form.get-submission':
            return resourceRoute(
                params,
                'GET',
                (id) =>
                    `/forms/${id}/submissions/${encodeURIComponent(requiredPayloadString(
                        params.payload,
                        'submissionId',
                    ))}`,
            )
        case 'form.create-trigger':
            return resourceRoute(
                params,
                'POST',
                (id) => `/forms/${id}/triggers`,
                parseTriggerPayload(params.payload, false),
            )
        case 'form.delete-trigger':
            return resourceRoute(
                params,
                'DELETE',
                (id) =>
                    `/forms/${id}/triggers/${encodeURIComponent(requiredPayloadString(
                        params.payload,
                        'triggerId',
                    ))}`,
            )
        case 'form.list-submissions':
            return resourceRoute(
                params,
                'GET',
                (id) => `/forms/${id}/submissions?limit=1`,
            )
        case 'form.open-workflow-session':
            return {
                method: 'POST',
                path: '/callbacks/activepieces/v1/form-workflow-sessions',
                payload: parseCallbackPayload(params.payload),
                callback: true,
            }
        case 'form.project-workflow-run':
            return {
                method: 'POST',
                path: '/callbacks/activepieces/v1/workflow-run-projections',
                payload: parseCallbackPayload(params.payload),
                callback: true,
            }
        case 'task.open-workflow-approval':
            return {
                method: 'POST',
                path: '/callbacks/activepieces/v1/workflow-task-created',
                payload: parseCallbackPayload(params.payload),
                callback: true,
            }
    }
}

function resourceRoute(
    params: PassgradCapabilityRequest,
    method: Method,
    path: (resourceId: string) => string,
    payload?: unknown,
): PassgradRoute {
    if (isNil(params.resourceId) || params.resourceId.length === 0 || params.resourceId.length > 255) {
        throw capabilityError('Passgrad resource ID is required')
    }
    return { method, path: path(encodeURIComponent(params.resourceId)), payload }
}

function requiredPayloadString(payload: unknown, key: string): string {
    if (
        !isStringRecord(payload) ||
    typeof payload[key] !== 'string' ||
    payload[key].length === 0
    ) {
        throw capabilityError(`Passgrad ${key} is required`)
    }
    return payload[key]
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && !isNil(value)
}

function capabilityError(message: string): ActivepiecesError {
    return new ActivepiecesError({
        code: ErrorCode.AUTHORIZATION,
        params: { message },
    })
}

const recordPayloadSchema = z.object({
    values: z.record(z.string(), z.unknown()),
}).strict()

const updateRecordPayloadSchema = z.object({
    recordId: z.string().min(1).max(255),
    values: z.record(z.string(), z.unknown()),
}).strict()

const formTriggerPayloadSchema = z.object({
    webhook_url: z.string().url().max(2048),
}).strict()

const tableTriggerPayloadSchema = formTriggerPayloadSchema.extend({
    event_type: z.enum(['create', 'update', 'delete']),
}).strict()

function parseRecordPayload(payload: unknown): Record<string, unknown> {
    return parseBoundedPayload(recordPayloadSchema, payload)
}

function parseUpdateRecordPayload(payload: unknown): { recordId: string, values: Record<string, unknown> } {
    return parseBoundedPayload(updateRecordPayloadSchema, payload)
}

function parseTriggerPayload(payload: unknown, table: boolean): Record<string, unknown> {
    return parseBoundedPayload(table ? tableTriggerPayloadSchema : formTriggerPayloadSchema, payload)
}

function parseCallbackPayload(payload: unknown): Record<string, unknown> {
    if (!isStringRecord(payload)) {
        throw capabilityError('Passgrad callback payload must be an object')
    }
    const forbiddenKeys = ['baseUrl', 'credential', 'credentialId', 'headers', 'method', 'path', 'projectId', 'secret', 'tenantId', 'url']
    if (Object.keys(payload).some((key) => forbiddenKeys.includes(key))) {
        throw capabilityError('Passgrad callback payload contains forbidden fields')
    }
    return parseBoundedPayload(z.record(z.string(), z.unknown()), payload)
}

function parseBoundedPayload<T>(schema: z.ZodType<T>, payload: unknown): T {
    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
        throw capabilityError('Passgrad capability payload is invalid')
    }
    const serialized = JSON.stringify(parsed.data)
    if (serialized.length > 256 * 1024) {
        throw capabilityError('Passgrad capability payload is too large')
    }
    return parsed.data
}

type PassgradCapabilityRequest = {
    projectId: string
    pieceName: PassgradPieceName
    operation: PassgradOperation
    resourceId?: string
    payload?: unknown
}

type PassgradOperation =
  | 'form.list'
  | 'table.get-record'
  | 'table.create-record'
  | 'table.update-record'
  | 'table.create-trigger'
  | 'table.delete-trigger'
  | 'table.list-records'
  | 'table.list'
  | 'table.get-fields'
  | 'form.get-submission'
  | 'form.create-trigger'
  | 'form.delete-trigger'
  | 'form.list-submissions'
  | 'form.open-workflow-session'
  | 'form.project-workflow-run'
  | 'task.open-workflow-approval'

type PassgradPieceName =
  | '@activepieces/piece-passgrad-table'
  | '@activepieces/piece-passgrad-form'

type PassgradRoute = {
    method: Method
    path: string
    payload?: unknown
    callback?: boolean
}

function assertOperationAllowed(params: PassgradCapabilityRequest): void {
    const tableOperations: PassgradOperation[] = [
        'table.get-record',
        'table.create-record',
        'table.update-record',
        'table.create-trigger',
        'table.delete-trigger',
        'table.list-records',
        'table.list',
        'table.get-fields',
    ]
    const formOperations: PassgradOperation[] = [
        'form.list',
        'form.get-submission',
        'form.create-trigger',
        'form.delete-trigger',
        'form.list-submissions',
        'form.open-workflow-session',
        'form.project-workflow-run',
        'task.open-workflow-approval',
        'table.create-record',
    ]
    const allowed = params.pieceName === '@activepieces/piece-passgrad-table'
        ? tableOperations.includes(params.operation)
        : params.pieceName === '@activepieces/piece-passgrad-form'
            ? formOperations.includes(params.operation)
            : false
    if (!allowed) {
        throw capabilityError('Passgrad piece cannot perform this operation')
    }
}
