import {
    PassgradCapability,
    PassgradRequest,
} from '@activepieces/pieces-framework'

export function createPassgradCapability(
    params: CreatePassgradCapabilityParams,
): PassgradCapability {
    const endpoint = `${params.apiUrl}v1/internal/passgrad/engine/request`
    return {
        async request<T = unknown>(request: PassgradRequest): Promise<T> {
            if (!params.credential) {
                throw new Error('Passgrad capability is not available for this invocation')
            }
            const body: PassgradInternalRequestBody = {
                operation: request.operation,
            }
            if (request.resourceId !== undefined) {
                body.resourceId = request.resourceId
            }
            if (request.payload !== undefined) {
                body.payload = request.payload
            }
            if (params.executionPath !== undefined) {
                body.executionPath = params.executionPath
            }
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${params.credential}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            })
            if (!response.ok) {
                throw new Error(
                    `Passgrad capability request failed with status ${response.status}`,
                )
            }
            return response.json() as Promise<T>
        },
    }
}

type CreatePassgradCapabilityParams = {
    apiUrl: string
    credential?: string
    executionPath?: readonly [string, number][]
}

type PassgradInternalRequestBody = {
    operation: PassgradRequest['operation']
    resourceId?: string
    payload?: unknown
    executionPath?: readonly [string, number][]
}
