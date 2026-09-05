function resolve(params: ResolveSourceSubmissionParams): string | null {
    if (params.triggerKind !== 'form_submission') {
        return null
    }
    const envelope = record(params.payload)
    const body = record(envelope?.body) ?? envelope
    if (body?.type === 'form.submitted.v2') {
        const submission = record(body.submission)
        return boundedId(submission?.id)
    }
    if (body?.event === 'form.submitted.v1') {
        return boundedId(body.submissionId)
    }
    return null
}

function record(value: unknown): Record<string, unknown> | null {
    const parsed = recordSchema.safeParse(value)
    return parsed.success ? parsed.data : null
}

function boundedId(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 255
        ? value
        : null
}

export const passgradSourceSubmissionUtils = { resolve }

type ResolveSourceSubmissionParams = {
    payload: unknown
    triggerKind: string
}
import { z } from 'zod'

const recordSchema = z.record(z.string(), z.unknown())
