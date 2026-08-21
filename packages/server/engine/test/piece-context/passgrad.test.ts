import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPassgradCapability } from '../../src/lib/piece-context/passgrad'

describe('Passgrad capability context', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('forwards only the typed request and piece identity to the internal endpoint', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
            JSON.stringify({ data: [] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        ))
        const capability = createPassgradCapability({
            apiUrl: 'http://activepieces.internal/',
            engineToken: 'engine-token',
            pieceName: '@activepieces/piece-passgrad-form',
        })

        await capability.request({ operation: 'form.list' })

        expect(fetchSpy).toHaveBeenCalledWith(
            'http://activepieces.internal/v1/internal/passgrad/engine/request',
            {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer engine-token',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ operation: 'form.list', pieceName: '@activepieces/piece-passgrad-form' }),
            },
        )
    })

    it('does not serialize engine or binding secrets into generic context', () => {
        const context = {
            passgrad: createPassgradCapability({
                apiUrl: 'http://activepieces.internal/',
                engineToken: 'engine-token',
                pieceName: '@activepieces/piece-passgrad-table',
            }),
        }

        const serialized = JSON.stringify(context)
        expect(serialized).not.toContain('engine-token')
        expect(serialized).not.toContain('binding-secret')
        expect(serialized).not.toContain('credential-id')
    })
})
