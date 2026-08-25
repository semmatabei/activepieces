import { PassgradRequest } from '@activepieces/pieces-framework'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPassgradCapability } from '../../src/lib/piece-context/passgrad'

describe('Passgrad capability context', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('forwards only the typed request with a short-lived capability bearer', async () => {
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
            credential: 'opaque-capability-token',
        })

        await capability.request({ operation: 'form.list' })

        expect(fetchSpy).toHaveBeenCalledWith(
            'http://activepieces.internal/v1/internal/passgrad/engine/request',
            {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer opaque-capability-token',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ operation: 'form.list' }),
            },
        )
    })

    it('sends the trusted engine path after piece-authored fields and drops illicit path properties', async () => {
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
            credential: 'opaque-capability-token',
            executionPath: [['loop', 1]],
        })
        const request: PassgradRequest = {
            operation: 'table.create-record',
            resourceId: 'table-1',
            payload: { values: { title: 'safe' } },
        }
        Object.assign(request, { executionPath: [['spoofed-loop', 7]] })

        await capability.request(request)

        expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
            operation: 'table.create-record',
            resourceId: 'table-1',
            payload: { values: { title: 'safe' } },
            executionPath: [['loop', 1]],
        })
    })

    it('omits executionPath entirely when composed without one, even for illicit request properties', async () => {
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
            credential: 'opaque-capability-token',
        })
        const request: PassgradRequest = { operation: 'form.list' }
        Object.assign(request, { executionPath: [['spoofed-loop', 0]] })

        await capability.request(request)

        expect(
            Object.hasOwn(
                JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)),
                'executionPath',
            ),
        ).toBe(false)
    })

    it('does not serialize engine or binding secrets into generic context', () => {
        const context = {
            passgrad: createPassgradCapability({
                apiUrl: 'http://activepieces.internal/',
                credential: 'opaque-capability-token',
                executionPath: [['secret-loop-name', 3]],
            }),
        }

        const serialized = JSON.stringify(context)
        expect(serialized).not.toContain('opaque-capability-token')
        expect(serialized).not.toContain('binding-secret')
        expect(serialized).not.toContain('credential-id')
        expect(serialized).not.toContain('executionPath')
        expect(serialized).not.toContain('secret-loop-name')
        expect(serialized).not.toContain('pgocc_v1_')
    })
})
