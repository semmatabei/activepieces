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
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${params.credential}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
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
}
