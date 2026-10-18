import {
    PassgradCapability,
    PassgradRequest,
} from '@activepieces/pieces-framework'

/**
 * A request Passgrad refused. A 4xx other than a timeout or rate limit says the request itself is
 * wrong, so repeating it cannot succeed: the engine marks the step failure as permanent.
 */
export class PassgradRequestError extends Error {
    readonly status: number
    readonly permanent: boolean

    constructor(status: number) {
        super(`Passgrad capability request failed with status ${status}`)
        this.name = 'PassgradRequestError'
        this.status = status
        this.permanent = status >= 400 && status < 500 && ![408, 425, 429].includes(status)
    }
}

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
                throw new PassgradRequestError(response.status)
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
