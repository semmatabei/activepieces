import { afterEach, describe, expect, it, vi } from 'vitest'
import { mintPassgradCapability, PASSGRAD_CAPABILITY_GRACE_SECONDS } from '../../../src/lib/execute/passgrad-capability'

const invocation = {
    projectId: 'project-1',
    pieceName: '@activepieces/piece-passgrad-form',
    invocationType: 'execution' as const,
    invocationId: 'run-1234567890123456:step',
    flowRunId: 'run-1234567890123456',
    flowVersionId: 'version-1234567890123456',
    stepName: 'step',
}

function decodePayload(token: string): { iat: number, exp: number } {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { iat: number, exp: number }
}

describe('Passgrad capability lifetime', () => {
    afterEach(() => {
        delete process.env.AP_PASSGRAD_ENGINE_CAPABILITY_SECRET
        vi.useRealTimers()
    })
    it('covers trusted job timeout plus bounded grace', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
        process.env.AP_PASSGRAD_ENGINE_CAPABILITY_SECRET = 'x'.repeat(32)
        const payload = decodePayload(mintPassgradCapability({ ...invocation, timeoutInSeconds: 600 }))
        expect(payload.exp - payload.iat).toBe(600 + PASSGRAD_CAPABILITY_GRACE_SECONDS)
        expect(payload.iat + 600).toBeLessThan(payload.exp)
        expect(payload.iat + 616).toBeGreaterThan(payload.exp)
        vi.useRealTimers()
    })

    it('cannot accept caller expiry overrides', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
        process.env.AP_PASSGRAD_ENGINE_CAPABILITY_SECRET = 'x'.repeat(32)
        const input = Object.assign({ ...invocation, timeoutInSeconds: 600 }, { exp: 9999999999 })
        const payload = decodePayload(mintPassgradCapability(input))
        expect(payload.exp - payload.iat).toBe(600 + PASSGRAD_CAPABILITY_GRACE_SECONDS)
        vi.useRealTimers()
    })
})
