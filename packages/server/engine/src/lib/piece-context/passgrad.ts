import { PassgradCapability, PassgradRequest } from '@activepieces/pieces-framework'

export function createPassgradCapability(params: CreatePassgradCapabilityParams): PassgradCapability {
    return {
        async request<T = unknown>(request: PassgradRequest): Promise<T> {
            const response = await fetch(`${params.apiUrl}v1/internal/passgrad/engine/request`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${params.engineToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ...request, pieceName: params.pieceName }),
            })
            if (!response.ok) {
                throw new Error(`Passgrad capability request failed with status ${response.status}`)
            }
            return response.json() as Promise<T>
        },
    }
}

type CreatePassgradCapabilityParams = {
    apiUrl: string
    engineToken: string
    pieceName: string
}
