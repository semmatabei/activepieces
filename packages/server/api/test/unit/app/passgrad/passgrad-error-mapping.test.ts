import { describe, expect, it } from 'vitest'

import {
    capabilityFailure,
    errorCodeForStatus,
    passgradResponseMessage,
} from '../../../../src/app/passgrad/passgrad-error-mapping'

describe('Passgrad capability error mapping', () => {
    it('keeps the class of a refusal instead of collapsing it into 403', () => {
        expect(errorCodeForStatus(422)).toBe('VALIDATION')
        expect(errorCodeForStatus(400)).toBe('VALIDATION')
        expect(errorCodeForStatus(409)).toBe('VALIDATION')
        expect(errorCodeForStatus(404)).toBe('ENTITY_NOT_FOUND')
        expect(errorCodeForStatus(403)).toBe('AUTHORIZATION')
        expect(errorCodeForStatus(401)).toBe('AUTHENTICATION')
        expect(errorCodeForStatus(429)).toBe('QUOTA_EXCEEDED')
        expect(errorCodeForStatus(500)).toBe('GENERIC_ERROR')
    })

    it('surfaces the Passgrad message for a 4xx refusal', () => {
        const failure = capabilityFailure(422, {
            error: { code: 'validation_failed', message: 'expectedVersion: expected number, received undefined' },
        })
        expect(failure.code).toBe('VALIDATION')
        expect(failure.message).toBe(
            'Passgrad refused the request (422): expectedVersion: expected number, received undefined',
        )
    })

    it('keeps 5xx as a generic service failure without forwarding its body', () => {
        const failure = capabilityFailure(503, { error: { message: 'engine unavailable' } })
        expect(failure.code).toBe('GENERIC_ERROR')
        expect(failure.message).toBe('Passgrad capability request failed with status 503')
    })

    it('falls back when the body carries no usable message', () => {
        expect(passgradResponseMessage({ error: {} })).toBeUndefined()
        expect(passgradResponseMessage('<html>bad gateway</html>')).toBeUndefined()
        expect(passgradResponseMessage('plain gateway text')).toBeUndefined()
        expect(passgradResponseMessage(undefined)).toBeUndefined()
        expect(capabilityFailure(404, null).message).toBe('Passgrad refused the request with status 404')
    })

    it('truncates a long body message', () => {
        const long = 'x'.repeat(900)
        expect(passgradResponseMessage({ error: { message: long } })?.length).toBe(512)
    })
})
