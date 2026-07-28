import { safeHttp } from '@activepieces/server-utils'
import { ActivepiecesError, ErrorCode, isNil } from '@activepieces/shared'
import { AxiosRequestConfig, Method } from 'axios'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { passgradProjectBindingService } from './passgrad-project-binding.service'

export const passgradCapabilityService = {
    async request(params: PassgradCapabilityRequest): Promise<unknown> {
        assertOperationAllowed(params)
        const binding = await passgradProjectBindingService.getCredentials(params.projectId)
        if (isNil(binding)) {
            throw capabilityError('Project is not bound to Passgrad')
        }
        const apiUrl = system.get(AppSystemProp.PASSGRAD_API_URL)
        if (isNil(apiUrl)) {
            throw capabilityError('Passgrad API URL is not configured')
        }
        const route = buildRoute(params)
        const response = await safeHttp.axios.request({
            method: route.method,
            url: `${apiUrl.replace(/\/$/, '')}/tenants/${binding.tenantId}${route.path}`,
            headers: {
                'x-passgrad-binding-credential-id': binding.credentialId,
                'x-passgrad-binding-project-id': params.projectId,
                'x-passgrad-binding-secret': binding.callbackSecret,
                ...(route.callback ? {
                    'x-passgrad-callback-credential-id': binding.credentialId,
                    'x-passgrad-callback-secret': binding.callbackSecret,
                    'x-passgrad-project-id': params.projectId,
                } : {}),
            },
            data: route.payload,
        } satisfies AxiosRequestConfig)
        return response.data
    },
}

function buildRoute(params: PassgradCapabilityRequest): PassgradRoute {
    switch (params.operation) {
        case 'table.get-record': return resourceRoute(params, 'GET', (id) => `/tables/${id}/records/${requiredPayloadString(params.payload, 'recordId')}`)
        case 'table.create-record': return resourceRoute(params, 'POST', (id) => `/tables/${id}/records`, params.payload)
        case 'table.update-record': return resourceRoute(params, 'PATCH', (id) => `/tables/${id}/records/${requiredPayloadString(params.payload, 'recordId')}`, params.payload)
        case 'table.create-trigger': return resourceRoute(params, 'POST', (id) => `/tables/${id}/triggers`, params.payload)
        case 'table.delete-trigger': return resourceRoute(params, 'DELETE', (id) => `/tables/${id}/triggers/${requiredPayloadString(params.payload, 'triggerId')}`)
        case 'table.list-records': return resourceRoute(params, 'GET', (id) => `/tables/${id}/records?limit=1&sort=-created_at`)
        case 'form.get-submission': return resourceRoute(params, 'GET', (id) => `/forms/${id}/submissions/${requiredPayloadString(params.payload, 'submissionId')}`)
        case 'form.create-trigger': return resourceRoute(params, 'POST', (id) => `/forms/${id}/triggers`, params.payload)
        case 'form.delete-trigger': return resourceRoute(params, 'DELETE', (id) => `/forms/${id}/triggers/${requiredPayloadString(params.payload, 'triggerId')}`)
        case 'form.list-submissions': return resourceRoute(params, 'GET', (id) => `/forms/${id}/submissions?limit=1`)
        case 'form.open-workflow-session': return {
            method: 'POST',
            path: '/callbacks/activepieces/v1/form-workflow-sessions',
            payload: params.payload,
            callback: true,
        }
    }
}

function resourceRoute(params: PassgradCapabilityRequest, method: Method, path: (resourceId: string) => string, payload?: unknown): PassgradRoute {
    if (isNil(params.resourceId) || params.resourceId.length === 0) {
        throw capabilityError('Passgrad resource ID is required')
    }
    return { method, path: path(params.resourceId), payload }
}

function requiredPayloadString(payload: unknown, key: string): string {
    if (!isStringRecord(payload) || typeof payload[key] !== 'string' || payload[key].length === 0) {
        throw capabilityError(`Passgrad ${key} is required`)
    }
    return payload[key]
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && !isNil(value)
}

function capabilityError(message: string): ActivepiecesError {
    return new ActivepiecesError({ code: ErrorCode.AUTHORIZATION, params: { message } })
}

type PassgradCapabilityRequest = {
    projectId: string
    pieceName: PassgradPieceName
    operation: PassgradOperation
    resourceId?: string
    payload?: unknown
}

type PassgradOperation =
    | 'table.get-record' | 'table.create-record' | 'table.update-record' | 'table.create-trigger' | 'table.delete-trigger' | 'table.list-records'
    | 'form.get-submission' | 'form.create-trigger' | 'form.delete-trigger' | 'form.list-submissions' | 'form.open-workflow-session'

type PassgradPieceName = '@activepieces/piece-passgrad-table' | '@activepieces/piece-passgrad-form'

type PassgradRoute = { method: Method, path: string, payload?: unknown, callback?: boolean }

function assertOperationAllowed(params: PassgradCapabilityRequest): void {
    const tableOperation = params.operation.startsWith('table.')
    const allowed = (params.pieceName === '@activepieces/piece-passgrad-table' && tableOperation)
        || (params.pieceName === '@activepieces/piece-passgrad-form' && !tableOperation)
    if (!allowed) {
        throw capabilityError('Passgrad piece cannot perform this operation')
    }
}
