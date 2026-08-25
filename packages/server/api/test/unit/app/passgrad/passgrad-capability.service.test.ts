import { safeHttp } from '@activepieces/server-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { system } from '../../../../src/app/helper/system/system'
import { derivePassgradOccurrenceId, passgradCapabilityService } from '../../../../src/app/passgrad/passgrad-capability.service'
import { passgradEngineRequestSchema } from '../../../../src/app/passgrad/passgrad-engine-request.schema'
import { passgradProjectBindingService } from '../../../../src/app/passgrad/passgrad-project-binding.service'
import { passgradResourceIdSchema } from '../../../../src/app/passgrad/passgrad-resource-id'

const actorUserId = '019ffac2-a4cb-7144-96a5-37d26eed1467'
const formResourceId = '7zzzzzzzzzzzzzzzzzzzzzzzzz'
const workflowResourceId = '3abcdefghjkmnpqrstvwxyz456'
const submissionResourceId = '2abcdefghjkmnpqrstvwxyz789'
const groupResourceId = '6abcdefghjkmnpqrstvwxyz123'
const workflowSessionPayload = {
    actorUserId,
    formId: formResourceId,
    resumeUrl: 'https://activepieces.test/v1/flow-runs/run/waitpoints/node',
    workflowNodeReference: 'form-node',
    workflowReference: 'flow-1',
    workflowRunReference: 'run-1',
}
const workflowRunPayload = {
    apEventSequence: 1,
    apRunId: 'run-1',
    eventId: 'run-1:succeeded',
    finishedAt: '2026-08-21T10:00:00.000Z',
    safeFailureSummary: null,
    result: { accepted: true },
    sourceSubmissionId: null,
    startedAt: null,
    status: 'succeeded' as const,
    triggerKind: 'manual' as const,
    type: 'workflow.run.projection.v1' as const,
    workflowId: workflowResourceId,
}
const workflowTaskPayload = {
    apRunId: 'run-1',
    apStepId: 'approval-step',
    apTaskId: 'task-1',
    eventId: 'task-event-1',
    type: 'workflow.task.created.v1' as const,
    workflowId: workflowResourceId,
    task: {
        type: 'approval' as const,
        title: 'Review request',
        description: '',
        priority: 'normal' as const,
        resumeUrl: 'https://activepieces.test/v1/flow-runs/run/waitpoints/node',
        dueAt: null,
        targets: [{ type: 'group' as const, groupId: groupResourceId }],
    },
}
const actionRequestPayload = {
    type: 'workflow.action.requested.v1' as const,
    eventId: 'action-event-1',
    sourceSubmissionId: submissionResourceId,
    definition: {
        title: 'Complete enrollment data',
        description: '',
        assignee: { type: 'source_submitter' as const },
        fields: [{ key: 'notes', label: 'Notes', type: 'text' }],
        policy: 'any' as const,
    },
    priority: 'normal' as const,
    dueAt: null,
    resumeUrl: 'https://activepieces.test/v1/flow-runs/run/waitpoints/node',
}
const approvalRequestPayload = {
    type: 'workflow.approval.requested.v2' as const,
    eventId: 'approval-event-1',
    definition: {
        sourceSubmissionId: submissionResourceId,
        title: 'Approve enrollment',
        description: '',
        approver: { type: 'groups' as const, groupIds: [groupResourceId] },
        minimumApprovals: 1,
        rejectionPolicy: 'any_rejection' as const,
        comment: { enabled: true, required: false },
        attachment: { enabled: true, required: false, maxFiles: 3 },
    },
    resumeUrl: 'https://activepieces.test/v1/flow-runs/run/waitpoints/node',
}

describe('passgradCapabilityService', () => {
    beforeEach(() => {
        vi.spyOn(safeHttp.axios, 'request').mockReset()
        vi.spyOn(system, 'get').mockReturnValue('https://api.passgrad.test/v1')
        vi.spyOn(passgradProjectBindingService, 'getCredentials').mockResolvedValue({
            tenantId: 'tenant-from-binding', credentialId: 'credential-from-binding', callbackSecret: 'server-only-secret',
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('uses engine project binding and server-derived Passgrad URL', async () => {
        vi.mocked(safeHttp.axios.request).mockResolvedValue({ data: { record: { id: 'record-1' } } })

        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-table',
            operation: 'table.create-record',
            resourceId: 'table-1',
            payload: { values: { title: 'safe' } },
        })

        expect(passgradProjectBindingService.getCredentials).toHaveBeenCalledWith('engine-project')
        expect(safeHttp.axios.request).toHaveBeenCalledWith(expect.objectContaining({
            url: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/tables/table-1/records',
            headers: expect.objectContaining({
                'x-passgrad-binding-credential-id': 'credential-from-binding',
                'x-passgrad-binding-project-id': 'engine-project',
            }),
        }))
    })

    it('uses the binding-derived callback route without a tenant path', async () => {
        vi.mocked(safeHttp.axios.request).mockResolvedValue({ data: { data: { id: 'session-1' } } })

        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'form.open-workflow-session',
            payload: workflowSessionPayload,
        })

        expect(safeHttp.axios.request).toHaveBeenCalledWith(expect.objectContaining({
            url: 'https://api.passgrad.test/v1/callbacks/activepieces/v1/form-workflow-sessions',
            headers: expect.objectContaining({
                'x-passgrad-callback-credential-id': 'credential-from-binding',
                'x-passgrad-project-id': 'engine-project',
            }),
        }))
    })

    it('injects trusted execution into submission interaction callbacks', async () => {
        vi.mocked(safeHttp.axios.request).mockResolvedValue({ data: { data: {} } })
        const execution = {
            runId: 'run-1',
            stepId: 'step-1',
            executionPath: [] as readonly [string, number][],
        }

        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'workflow.add-information',
            payload: {
                type: 'workflow.submission-information.appended.v1',
                eventId: 'information-event-1',
                sourceSubmissionId: submissionResourceId,
                title: 'Fee Summary',
                description: '',
                data: { total: 500000 },
            },
            execution,
        })
        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'workflow.complete-process',
            payload: {
                type: 'workflow.process.completed.v1',
                eventId: 'completion-event-1',
                sourceSubmissionId: submissionResourceId,
                resolution: 'approved',
                summary: '',
                data: {},
            },
            execution,
        })

        const occurrenceId = derivePassgradOccurrenceId({
            flowRunId: execution.runId,
            stepName: execution.stepId,
            executionPath: execution.executionPath,
        })
        expect(safeHttp.axios.request).toHaveBeenNthCalledWith(1, expect.objectContaining({
            url: 'https://api.passgrad.test/v1/callbacks/activepieces/v1/submission-information',
            data: expect.objectContaining({
                execution: { apRunId: 'run-1', apStepId: 'step-1', apOccurrenceId: occurrenceId },
            }),
            headers: expect.objectContaining({ 'x-passgrad-ap-occurrence-id': occurrenceId }),
        }))
        expect(safeHttp.axios.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
            url: 'https://api.passgrad.test/v1/callbacks/activepieces/v1/process-completions',
        }))
    })

    it('injects trusted execution into action and approval waitpoint callbacks', async () => {
        vi.mocked(safeHttp.axios.request).mockResolvedValue({ data: { data: {} } })
        const execution = {
            runId: 'run-1',
            stepId: 'step-1',
            executionPath: [] as readonly [string, number][],
        }

        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'workflow.open-action-request',
            payload: actionRequestPayload,
            execution,
        })
        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'workflow.open-approval-request',
            payload: approvalRequestPayload,
            execution,
        })

        const occurrenceId = derivePassgradOccurrenceId({
            flowRunId: execution.runId,
            stepName: execution.stepId,
            executionPath: execution.executionPath,
        })
        const expectedExecution = {
            apRunId: 'run-1',
            apStepId: 'step-1',
            apOccurrenceId: occurrenceId,
        }
        expect(safeHttp.axios.request).toHaveBeenNthCalledWith(1, expect.objectContaining({
            url: 'https://api.passgrad.test/v1/callbacks/activepieces/v1/action-requests',
            data: expect.objectContaining({ execution: expectedExecution }),
            headers: expect.objectContaining({ 'x-passgrad-ap-occurrence-id': occurrenceId }),
        }))
        expect(safeHttp.axios.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
            url: 'https://api.passgrad.test/v1/callbacks/activepieces/v1/approval-requests',
            data: expect.objectContaining({ execution: expectedExecution }),
        }))
    })

    it('rejects Action and Approval waitpoints inside loops', async () => {
        const execution = {
            runId: 'run-1',
            stepId: 'step-1',
            executionPath: [['loop', 0]] as readonly [string, number][],
        }

        await expect(passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'workflow.open-action-request',
            payload: actionRequestPayload,
            execution,
        })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })
        await expect(passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'workflow.open-approval-request',
            payload: approvalRequestPayload,
            execution,
        })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })

        expect(safeHttp.axios.request).not.toHaveBeenCalled()
    })

    it('requires execution context for Action and Approval waitpoints', async () => {
        await expect(passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'workflow.open-action-request',
            payload: actionRequestPayload,
        })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })
        await expect(passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'workflow.open-approval-request',
            payload: approvalRequestPayload,
        })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })

        expect(safeHttp.axios.request).not.toHaveBeenCalled()
    })

    it('rejects engine project without a persisted binding', async () => {
        vi.mocked(passgradProjectBindingService.getCredentials).mockResolvedValue(null)

        await expect(passgradCapabilityService.request({
            projectId: 'wrong-engine-project',
            pieceName: '@activepieces/piece-passgrad-table',
            operation: 'table.list-records',
            resourceId: 'table-1',
        })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })

        expect(safeHttp.axios.request).not.toHaveBeenCalled()
    })

    it('rejects an operation outside the capability piece allowlist', async () => {
        await expect(passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'table.list-records',
            resourceId: 'table-1',
        })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })

        expect(passgradProjectBindingService.getCredentials).not.toHaveBeenCalled()
        expect(safeHttp.axios.request).not.toHaveBeenCalled()
    })

    it('routes selector operations through fixed tenant-scoped paths', async () => {
        vi.mocked(safeHttp.axios.request).mockResolvedValue({ data: { data: [] } })

        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'form.list',
        })
        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-table',
            operation: 'table.list',
        })
        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-table',
            operation: 'table.get-fields',
            resourceId: 'table/one',
        })

        expect(safeHttp.axios.request).toHaveBeenNthCalledWith(1, expect.objectContaining({
            method: 'GET',
            url: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/forms',
        }))
        expect(safeHttp.axios.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
            method: 'GET',
            url: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/tables',
        }))
        expect(safeHttp.axios.request).toHaveBeenNthCalledWith(3, expect.objectContaining({
            method: 'GET',
            url: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/tables/table%2Fone/fields',
        }))
    })

    it('maps every allowed operation to a fixed Passgrad route', async () => {
        vi.mocked(safeHttp.axios.request).mockResolvedValue({ data: {} })
        const cases = [
            {
                pieceName: '@activepieces/piece-passgrad-form',
                operation: 'form.list',
                expectedMethod: 'GET',
                expectedUrl: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/forms',
            },
            {
                pieceName: '@activepieces/piece-passgrad-form',
                operation: 'form.get-submission',
                expectedMethod: 'GET',
                resourceId: 'form-1',
                payload: { submissionId: 'submission-1' },
                expectedUrl: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/forms/form-1/submissions/submission-1',
            },
            {
                pieceName: '@activepieces/piece-passgrad-form',
                operation: 'form.create-trigger',
                expectedMethod: 'POST',
                resourceId: 'form-1',
                payload: { webhook_url: 'https://hooks.test/form' },
                expectedUrl: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/forms/form-1/triggers',
            },
            {
                pieceName: '@activepieces/piece-passgrad-form',
                operation: 'form.delete-trigger',
                expectedMethod: 'DELETE',
                resourceId: 'form-1',
                payload: { triggerId: 'trigger-1' },
                expectedUrl: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/forms/form-1/triggers/trigger-1',
            },
            {
                pieceName: '@activepieces/piece-passgrad-form',
                operation: 'form.list-submissions',
                expectedMethod: 'GET',
                resourceId: 'form-1',
                expectedUrl: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/forms/form-1/submissions?limit=1',
            },
            {
                pieceName: '@activepieces/piece-passgrad-form',
                operation: 'form.open-workflow-session',
                expectedMethod: 'POST',
                payload: workflowSessionPayload,
                expectedUrl: 'https://api.passgrad.test/v1/callbacks/activepieces/v1/form-workflow-sessions',
            },
            {
                pieceName: '@activepieces/piece-passgrad-form',
                operation: 'form.project-workflow-run',
                expectedMethod: 'POST',
                payload: workflowRunPayload,
                expectedUrl: 'https://api.passgrad.test/v1/callbacks/activepieces/v1/workflow-run-projections',
            },
            {
                pieceName: '@activepieces/piece-passgrad-form',
                operation: 'task.open-workflow-approval',
                expectedMethod: 'POST',
                payload: workflowTaskPayload,
                expectedUrl: 'https://api.passgrad.test/v1/callbacks/activepieces/v1/workflow-task-created',
            },
            {
                pieceName: '@activepieces/piece-passgrad-table',
                operation: 'table.list',
                expectedMethod: 'GET',
                expectedUrl: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/tables',
            },
            {
                pieceName: '@activepieces/piece-passgrad-table',
                operation: 'table.get-fields',
                expectedMethod: 'GET',
                resourceId: 'table-1',
                expectedUrl: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/tables/table-1/fields',
            },
            {
                pieceName: '@activepieces/piece-passgrad-table',
                operation: 'table.get-record',
                expectedMethod: 'GET',
                resourceId: 'table-1',
                payload: { recordId: 'record-1' },
                expectedUrl: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/tables/table-1/records/record-1',
            },
            {
                pieceName: '@activepieces/piece-passgrad-table',
                operation: 'table.get-records-by-ids',
                expectedMethod: 'POST',
                resourceId: 'table-1',
                payload: { recordIds: [submissionResourceId], missingRecordPolicy: 'fail' },
                expectedUrl: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/tables/table-1/records/batch-get',
            },
            {
                pieceName: '@activepieces/piece-passgrad-table',
                operation: 'table.create-record',
                expectedMethod: 'POST',
                resourceId: 'table-1',
                payload: { values: { title: 'safe' } },
                expectedUrl: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/tables/table-1/records',
            },
            {
                pieceName: '@activepieces/piece-passgrad-table',
                operation: 'table.update-record',
                expectedMethod: 'PATCH',
                resourceId: 'table-1',
                payload: { recordId: 'record-1', values: { title: 'safe' } },
                expectedUrl: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/tables/table-1/records/record-1',
            },
            {
                pieceName: '@activepieces/piece-passgrad-table',
                operation: 'table.create-trigger',
                expectedMethod: 'POST',
                resourceId: 'table-1',
                payload: { webhook_url: 'https://hooks.test/table', event_type: 'create' },
                expectedUrl: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/tables/table-1/triggers',
            },
            {
                pieceName: '@activepieces/piece-passgrad-table',
                operation: 'table.delete-trigger',
                expectedMethod: 'DELETE',
                resourceId: 'table-1',
                payload: { triggerId: 'trigger-1' },
                expectedUrl: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/tables/table-1/triggers/trigger-1',
            },
            {
                pieceName: '@activepieces/piece-passgrad-table',
                operation: 'table.list-records',
                expectedMethod: 'GET',
                resourceId: 'table-1',
                expectedUrl: 'https://api.passgrad.test/v1/tenants/tenant-from-binding/tables/table-1/records?limit=1&sort=-created_at',
            },
        ] as const

        for (const testCase of cases) {
            await passgradCapabilityService.request({
                projectId: 'engine-project',
                pieceName: testCase.pieceName,
                operation: testCase.operation,
                resourceId: testCase.resourceId,
                payload: testCase.payload,
            })
        }

        expect(safeHttp.axios.request).toHaveBeenCalledTimes(cases.length)
        cases.forEach((testCase, index) => {
            expect(safeHttp.axios.request).toHaveBeenNthCalledWith(index + 1, expect.objectContaining({
                method: testCase.expectedMethod,
                url: testCase.expectedUrl,
            }))
        })
    })

    it('rejects every Table-only operation from the Form piece', async () => {
        const requests = [
            { operation: 'table.get-record', resourceId: 'table-1', payload: { recordId: 'record-1' } },
            { operation: 'table.get-records-by-ids', resourceId: 'table-1', payload: { recordIds: [submissionResourceId], missingRecordPolicy: 'fail' } },
            { operation: 'table.update-record', resourceId: 'table-1', payload: { recordId: 'record-1', values: {} } },
            { operation: 'table.create-trigger', resourceId: 'table-1', payload: { webhook_url: 'https://hooks.test/table', event_type: 'create' } },
            { operation: 'table.delete-trigger', resourceId: 'table-1', payload: { triggerId: 'trigger-1' } },
            { operation: 'table.list-records', resourceId: 'table-1' },
            { operation: 'table.list' },
            { operation: 'table.get-fields', resourceId: 'table-1' },
        ] as const

        for (const request of requests) {
            await expect(passgradCapabilityService.request({
                projectId: 'engine-project',
                pieceName: '@activepieces/piece-passgrad-form',
                ...request,
            })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })
        }

        expect(passgradProjectBindingService.getCredentials).not.toHaveBeenCalled()
        expect(safeHttp.axios.request).not.toHaveBeenCalled()
    })

    it('sends only the fixed record payload shape', async () => {
        vi.mocked(safeHttp.axios.request).mockResolvedValue({ data: { record: { id: 'record-1' } } })

        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-table',
            operation: 'table.update-record',
            resourceId: 'table-1',
            payload: { recordId: 'record-1', values: { title: 'safe' } },
        })

        expect(safeHttp.axios.request).toHaveBeenCalledWith(expect.objectContaining({
            method: 'PATCH',
            data: { values: { title: 'safe' } },
        }))
    })

    it('rejects malformed operation payloads before outbound HTTP', async () => {
        await expect(passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-table',
            operation: 'table.create-record',
            resourceId: 'table-1',
            payload: { values: {}, url: 'https://attacker.invalid' },
        })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })

        expect(safeHttp.axios.request).not.toHaveBeenCalled()
    })

    it('forwards exact callback payloads and rejects omitted or unknown fields', async () => {
        vi.mocked(safeHttp.axios.request).mockResolvedValue({ data: {} })

        for (const [operation, payload] of [
            ['form.open-workflow-session', workflowSessionPayload],
            ['form.project-workflow-run', workflowRunPayload],
            ['task.open-workflow-approval', workflowTaskPayload],
        ] as const) {
            await passgradCapabilityService.request({
                projectId: 'engine-project',
                pieceName: '@activepieces/piece-passgrad-form',
                operation,
                payload,
            })
        }
        expect(safeHttp.axios.request).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ data: workflowSessionPayload }),
        )
        expect(safeHttp.axios.request).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ data: workflowRunPayload }),
        )
        expect(safeHttp.axios.request).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ data: workflowTaskPayload }),
        )

        await expect(passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'form.project-workflow-run',
            payload: { ...workflowRunPayload, attackerField: 'blocked' },
        })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })
        await expect(passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'form.open-workflow-session',
            payload: { formId: formResourceId },
        })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })
    })

    it('does not forward upstream error payloads into capability context', async () => {
        vi.mocked(safeHttp.axios.request).mockRejectedValue({
            isAxiosError: true,
            response: { data: { error: { message: 'server-only-secret' } } },
        })

        await expect(passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'form.list',
        })).rejects.toMatchObject({
            error: {
                params: { message: 'Passgrad capability request failed' },
            },
        })
    })

    it('appends trusted execution headers only when execution context is provided', async () => {
        vi.mocked(safeHttp.axios.request).mockResolvedValue({ data: {} })

        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'form.list',
            execution: {
                runId: 'run-1',
                stepId: 'add_information',
                executionPath: [['loop', 0]],
            },
        })
        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'form.list',
        })

        const withExecution = vi.mocked(safeHttp.axios.request).mock.calls[0][0]
        expect(withExecution.headers).toMatchObject({
            'x-passgrad-ap-run-id': 'run-1',
            'x-passgrad-ap-step-id': 'add_information',
        })
        expect(withExecution.headers?.['x-passgrad-ap-occurrence-id']).toMatch(
            /^pgocc_v1_[0-9a-f]{64}$/,
        )
        const withoutExecution = vi.mocked(safeHttp.axios.request).mock.calls[1][0]
        expect(withoutExecution.headers?.['x-passgrad-ap-run-id']).toBeUndefined()
        expect(withoutExecution.headers?.['x-passgrad-ap-step-id']).toBeUndefined()
        expect(withoutExecution.headers?.['x-passgrad-ap-occurrence-id']).toBeUndefined()
    })

    it('derives stable occurrence ids that differ per iteration and nesting', () => {
        const emptyPath = derivePassgradOccurrenceId({
            flowRunId: 'run-1',
            stepName: 'add_information',
            executionPath: [],
        })
        expect(emptyPath).toMatch(/^pgocc_v1_[0-9a-f]{64}$/)
        expect(emptyPath).toBe(derivePassgradOccurrenceId({
            flowRunId: 'run-1',
            stepName: 'add_information',
            executionPath: [],
        }))

        const iterationZero = derivePassgradOccurrenceId({
            flowRunId: 'run-1',
            stepName: 'add_information',
            executionPath: [['loop', 0]],
        })
        const iterationOne = derivePassgradOccurrenceId({
            flowRunId: 'run-1',
            stepName: 'add_information',
            executionPath: [['loop', 1]],
        })
        expect(iterationZero).not.toBe(iterationOne)
        expect(iterationZero).not.toBe(emptyPath)

        const nested = derivePassgradOccurrenceId({
            flowRunId: 'run-1',
            stepName: 'add_information',
            executionPath: [['outer', 1], ['inner', 0]],
        })
        expect(nested).toMatch(/^pgocc_v1_[0-9a-f]{64}$/)
        expect(nested).toBe(derivePassgradOccurrenceId({
            flowRunId: 'run-1',
            stepName: 'add_information',
            executionPath: [['outer', 1], ['inner', 0]],
        }))
        expect(nested).not.toBe(derivePassgradOccurrenceId({
            flowRunId: 'run-1',
            stepName: 'add_information',
            executionPath: [['inner', 1], ['outer', 0]],
        }))
        expect(nested).not.toBe(derivePassgradOccurrenceId({
            flowRunId: 'run-1',
            stepName: 'add_information',
            executionPath: [['outer', 1], ['inner', 1]],
        }))
    })

    it('binds execution path bounds in the engine request schema', () => {
        expect(passgradEngineRequestSchema.safeParse({
            operation: 'form.list',
            executionPath: [],
        }).success).toBe(true)
        expect(passgradEngineRequestSchema.safeParse({
            operation: 'form.list',
            executionPath: [['loop', 0], ['inner', 31]],
        }).success).toBe(true)
        expect(passgradEngineRequestSchema.safeParse({ operation: 'form.list' }).success).toBe(true)
        expect(passgradEngineRequestSchema.safeParse({
            operation: 'form.list',
            executionPath: [['loop', -1]],
        }).success).toBe(false)
        expect(passgradEngineRequestSchema.safeParse({
            operation: 'form.list',
            executionPath: [['loop', 1.5]],
        }).success).toBe(false)
        expect(passgradEngineRequestSchema.safeParse({
            operation: 'form.list',
            executionPath: [['loop']],
        }).success).toBe(false)
        expect(passgradEngineRequestSchema.safeParse({
            operation: 'form.list',
            executionPath: Array.from({ length: 33 }, (_, index) => [`loop_${index}`, 0]),
        }).success).toBe(false)
    })

    it('rejects trusted field overrides at the engine boundary', () => {
        for (const override of [
            { runId: 'attacker-run' },
            { stepId: 'attacker-step' },
            { occurrenceId: 'pgocc_v1_attacker' },
            { projectId: 'attacker-project' },
            { tenantId: 'attacker-tenant' },
            { headers: { 'x-passgrad-ap-run-id': 'attacker' } },
            { method: 'DELETE' },
            { url: 'https://attacker.invalid' },
            { callbackRoute: '/callbacks/activepieces/v1/workflow-task-created' },
        ]) {
            expect(passgradEngineRequestSchema.safeParse({
                operation: 'form.list',
                ...override,
            }).success).toBe(false)
        }
    })

    it('accepts S1-10 resource ids and rejects old UUID resource forms', async () => {
        vi.mocked(safeHttp.axios.request).mockResolvedValue({ data: {} })

        for (const candidate of [formResourceId, workflowResourceId, submissionResourceId, groupResourceId]) {
            expect(passgradResourceIdSchema.safeParse(candidate).success).toBe(true)
        }
        expect(passgradResourceIdSchema.safeParse(actorUserId).success).toBe(false)
        expect(passgradResourceIdSchema.safeParse('short').success).toBe(false)

        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'form.open-workflow-session',
            payload: workflowSessionPayload,
        })
        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'form.project-workflow-run',
            payload: { ...workflowRunPayload, sourceSubmissionId: submissionResourceId },
        })
        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'task.open-workflow-approval',
            payload: workflowTaskPayload,
        })

        const uuidRejections = [
            {
                operation: 'form.open-workflow-session' as const,
                payload: { ...workflowSessionPayload, formId: actorUserId },
            },
            {
                operation: 'form.project-workflow-run' as const,
                payload: { ...workflowRunPayload, workflowId: actorUserId },
            },
            {
                operation: 'form.project-workflow-run' as const,
                payload: { ...workflowRunPayload, sourceSubmissionId: actorUserId },
            },
            {
                operation: 'task.open-workflow-approval' as const,
                payload: { ...workflowTaskPayload, workflowId: actorUserId },
            },
            {
                operation: 'task.open-workflow-approval' as const,
                payload: {
                    ...workflowTaskPayload,
                    task: {
                        ...workflowTaskPayload.task,
                        targets: [{ type: 'group' as const, groupId: actorUserId }],
                    },
                },
            },
        ]
        for (const rejection of uuidRejections) {
            await expect(passgradCapabilityService.request({
                projectId: 'engine-project',
                pieceName: '@activepieces/piece-passgrad-form',
                operation: rejection.operation,
                payload: rejection.payload,
            })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })
        }
    })

    it('keeps UUID validation for Better Auth identity and technical ids', async () => {
        vi.mocked(safeHttp.axios.request).mockResolvedValue({ data: {} })

        await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'form.open-workflow-session',
            payload: workflowSessionPayload,
        })
        await expect(passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'form.open-workflow-session',
            payload: { ...workflowSessionPayload, actorUserId: formResourceId },
        })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })
        await expect(passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'task.open-workflow-approval',
            payload: {
                ...workflowTaskPayload,
                task: {
                    ...workflowTaskPayload.task,
                    targets: [{ type: 'user' as const, userId: formResourceId }],
                },
            },
        })).rejects.toMatchObject({ error: { code: 'AUTHORIZATION' } })
    })

    it('does not leak execution path or occurrence into capability errors', async () => {
        vi.mocked(safeHttp.axios.request).mockRejectedValue({
            isAxiosError: true,
            response: { data: { error: { message: 'server-only-secret' } } },
        })

        const error = await passgradCapabilityService.request({
            projectId: 'engine-project',
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'form.list',
            execution: {
                runId: 'run-1',
                stepId: 'add_information',
                executionPath: [['secret-loop-name', 2]],
            },
        }).catch((thrown: unknown) => thrown)

        expect(JSON.stringify(error)).not.toContain('secret-loop-name')
        expect(JSON.stringify(error)).not.toContain('pgocc_v1_')
        expect(JSON.stringify(error)).not.toContain('server-only-secret')
    })

    it('rejects non-Passgrad pieces and body scope overrides at the engine boundary', () => {
        expect(passgradEngineRequestSchema.safeParse({
            pieceName: '@activepieces/piece-unknown',
            operation: 'form.list',
        }).success).toBe(false)
        expect(passgradEngineRequestSchema.safeParse({
            pieceName: '@activepieces/piece-passgrad-form',
            operation: 'form.list',
            projectId: 'attacker-project',
            tenantId: 'attacker-tenant',
        }).success).toBe(false)
    })
})
