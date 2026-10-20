import { ErrorCode, isNil } from '@activepieces/shared'

/**
 * Passgrad answers failures with `{ error: { code, message } }`. Only the message is reused; it is
 * a user-facing sentence, and everything else in the body is dropped so nothing internal leaks.
 */
export function passgradResponseMessage(data: unknown): string | undefined {
    if (typeof data === 'string') {
        const trimmed = data.trim()
        return trimmed.length > 0 && trimmed.length <= 512 ? trimmed : undefined
    }
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
 * a validation problem, a 404 a missing record, a 403 a real permission problem.
 */
export function errorCodeForStatus(status: number): ErrorCode {
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
        case 429:
            return ErrorCode.QUOTA_EXCEEDED
        default:
            return ErrorCode.GENERIC_ERROR
    }
}

export type CapabilityFailure = {
    code: ErrorCode
    message: string
}

/** The error to raise for a non-2xx Passgrad capability response. */
export function capabilityFailure(status: number, data: unknown): CapabilityFailure {
    const apiMessage = passgradResponseMessage(data)
    if (status >= 500) {
        return {
            code: ErrorCode.GENERIC_ERROR,
            message: apiMessage
                ? `Passgrad capability request failed with status ${status}: ${apiMessage}`
                : `Passgrad capability request failed with status ${status}`,
        }
    }
    return {
        code: errorCodeForStatus(status),
        message: apiMessage
            ? `Passgrad refused the request (${status}): ${apiMessage}`
            : `Passgrad refused the request with status ${status}`,
    }
}
