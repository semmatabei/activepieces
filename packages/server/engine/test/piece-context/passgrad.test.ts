import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPassgradCapability } from '../../src/lib/piece-context/passgrad'

describe('Passgrad capability context', () => {
    afterEach(() => {
        delete process.env.AP_PASSGRAD_ENGINE_CAPABILITY_SECRET
        vi.restoreAllMocks()
    })

    it('forwards only the typed request with a short-lived capability bearer', async () => {
        process.env.AP_PASSGRAD_ENGINE_CAPABILITY_SECRET = 'capability-secret'
        const fetchSpy = vi
            .spyOn(global, 'fetch')
            .mockResolvedValue(
                new Response(JSON.stringify({ data: [] }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
            )
        const capability = createPassgradCapability({
            apiUrl: 'http://activepieces.internal/',
            projectId: 'project-1',
            pieceName: '@activepieces/piece-passgrad-form',
            invocationType: 'execution',
        })

        await capability.request({ operation: 'form.list' })

        expect(fetchSpy).toHaveBeenCalledWith(
            'http://activepieces.internal/v1/internal/passgrad/engine/request',
            {
                method: 'POST',
                headers: {
                    Authorization: expect.stringMatching(/^Bearer ey/),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ operation: 'form.list' }),
            },
        )
    })

    it('does not serialize engine or binding secrets into generic context', () => {
        process.env.AP_PASSGRAD_ENGINE_CAPABILITY_SECRET = 'capability-secret'
        const context = {
            passgrad: createPassgradCapability({
                apiUrl: 'http://activepieces.internal/',
                projectId: 'project-1',
                pieceName: '@activepieces/piece-passgrad-table',
                invocationType: 'property',
            }),
        }

        const serialized = JSON.stringify(context)
        expect(serialized).not.toContain('capability-secret')
        expect(serialized).not.toContain('binding-secret')
        expect(serialized).not.toContain('credential-id')
    })
})
