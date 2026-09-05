import { passgradSourceSubmissionUtils } from '../../../../src/app/webhooks/passgrad-source-submission'
import { describe, expect, it } from 'vitest'

describe('passgradSourceSubmissionUtils', () => {
    it.each([
        [{ event: 'form.submitted.v1', submissionId: 'submission-v1' }, 'submission-v1'],
        [{ body: { event: 'form.submitted.v1', submissionId: 'submission-v1-body' } }, 'submission-v1-body'],
        [{ type: 'form.submitted.v2', submission: { id: 'submission-v2' } }, 'submission-v2'],
        [{ body: { type: 'form.submitted.v2', submission: { id: 'submission-v2-body' } } }, 'submission-v2-body'],
    ])('extracts the source submission from supported form payloads', (payload, expected) => {
        expect(passgradSourceSubmissionUtils.resolve({ payload, triggerKind: 'form_submission' })).toBe(expected)
    })

    it('rejects malformed and non-form payloads', () => {
        expect(passgradSourceSubmissionUtils.resolve({ payload: { submissionId: 'submission' }, triggerKind: 'form_submission' })).toBeNull()
        expect(passgradSourceSubmissionUtils.resolve({ payload: { event: 'form.submitted.v1', submissionId: 'submission' }, triggerKind: 'webhook' })).toBeNull()
    })
})
