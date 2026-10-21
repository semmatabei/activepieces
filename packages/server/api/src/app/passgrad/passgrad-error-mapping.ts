import { ErrorCode, isNil } from '@activepieces/shared'

/**
 * Passgrad answers failures with `{ error: { code, message } }`. Only that message is reused: it is
 * a user-facing sentence. Raw bodies (HTML error pages, gateway text) and every other field are
 * dropped so nothing internal leaks.
 */
export function passgradResponseMessage(data: unknown): string | undefined {
    if (isNil(data) || typeof data !== 'object') return undefined
    const error = (data as { error?: unknown }).error
    if (isNil(error) || typeof error !== 'object') return undefined
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' && message.trim().length > 0
        ? message.trim().slice(0, 512)
        : undefined
}

/**
 * Keeps Passgrad's classification instead of collapsing every refusal into AUTHORIZATION: a 422 is
 * a validation problem, a 404 a missing record, a 403 a real permission problem. Only codes whose
 * params are just a message are used: QUOTA_EXCEEDED needs a platform usage metric, which a Passgrad
 * 429 (a rate limit) does not have, so it stays a generic failure.
 */
export type CapabilityErrorCode =
    | ErrorCode.VALIDATION
    | ErrorCode.AUTHENTICATION
    | ErrorCode.AUTHORIZATION
    | ErrorCode.ENTITY_NOT_FOUND
    | ErrorCode.GENERIC_ERROR

export function errorCodeForStatus(status: number): CapabilityErrorCode {
    switch (status) {
        case 400:
        case 409:
        case 422:
            return ErrorCode.VALIDATION
        case 401:
            return ErrorCode.AUTHENTICATION
        case 403:
            return ErrorCode.AUTHORIZATION
        case 404:
            return ErrorCode.ENTITY_NOT_FOUND
        default:
            return ErrorCode.GENERIC_ERROR
    }
}

export type CapabilityFailure = {
    code: CapabilityErrorCode
    message: string
}

/** The error to raise for a non-2xx Passgrad capability response. */
export function capabilityFailure(status: number, data: unknown): CapabilityFailure {
    const apiMessage = passgradResponseMessage(data)
    if (status >= 500) {
        // A 5xx body can be an internal error or a gateway page, so keep the generic wording.
        return {
            code: ErrorCode.GENERIC_ERROR,
            message: `Passgrad capability request failed with status ${status}`,
        }
    }
    return {
        code: errorCodeForStatus(status),
        message: apiMessage
            ? `Passgrad refused the request (${status}): ${apiMessage}`
            : `Passgrad refused the request with status ${status}`,
    }
}
