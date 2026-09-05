import { FlowVersion, FlowVersionState, FlowTriggerType } from '@activepieces/shared'

import { resolvePassgradTriggerKind } from '../../../../src/app/webhooks/passgrad-trigger-kind'

function flowVersion(pieceName: string, triggerName: string): FlowVersion {
    return {
    agentIds: [],
    backupFiles: null,
    connectionIds: [],
    created: '2026-08-09T00:00:00.000Z',
    displayName: 'Test',
    flowId: 'flow',
    id: 'version',
    notes: [],
    schemaVersion: null,
    state: FlowVersionState.LOCKED,
    trigger: {
      displayName: 'Trigger',
      lastUpdatedDate: '2026-08-09T00:00:00.000Z',
      name: 'trigger',
      settings: {
        input: {},
        pieceName,
        pieceVersion: '0.1.0',
        propertySettings: {},
        triggerName,
      },
      type: FlowTriggerType.PIECE,
      valid: true,
    },
    updated: '2026-08-09T00:00:00.000Z',
    updatedBy: null,
    valid: true,
    }
}

describe('resolvePassgradTriggerKind', () => {
    it.each([
        ['@activepieces/piece-passgrad-form', 'new_submission', 'form_submission'],
        ['@activepieces/piece-passgrad-form', 'new_submission_v2', 'form_submission'],
        ['@activepieces/piece-passgrad-table', 'new_record', 'record_created'],
        ['@activepieces/piece-passgrad-table', 'updated_record', 'record_updated'],
        ['@activepieces/piece-passgrad-table', 'deleted_record', 'record_deleted'],
        ['@activepieces/piece-schedule', 'cron_expression', 'schedule'],
        ['@activepieces/piece-webhook', 'catch_webhook', 'webhook'],
    ])('maps %s:%s to %s', (pieceName, triggerName, expected) => {
        expect(resolvePassgradTriggerKind(flowVersion(pieceName, triggerName))).toBe(expected)
    })
})
