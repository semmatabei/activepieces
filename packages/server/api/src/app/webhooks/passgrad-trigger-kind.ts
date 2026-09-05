import { FlowTriggerType, FlowVersion } from '@activepieces/shared'

export type PassgradTriggerKind =
    | 'form_submission'
    | 'record_created'
    | 'record_updated'
    | 'record_deleted'
    | 'schedule'
    | 'webhook'

export function resolvePassgradTriggerKind(flowVersion: FlowVersion): PassgradTriggerKind {
    const trigger = flowVersion.trigger
  if (trigger.type !== FlowTriggerType.PIECE) {
        return 'webhook'
  }

    const { pieceName, triggerName } = trigger.settings
    if (pieceName === '@activepieces/piece-schedule') {
        return 'schedule'
    }
    if (
        pieceName === '@activepieces/piece-passgrad-form' &&
        (triggerName === 'new_submission' || triggerName === 'new_submission_v2')
    ) {
        return 'form_submission'
    }
    if (pieceName !== '@activepieces/piece-passgrad-table') {
        return 'webhook'
    }
    if (triggerName === 'new_record') {
        return 'record_created'
    }
    if (triggerName === 'updated_record') {
        return 'record_updated'
    }
    if (triggerName === 'deleted_record') {
        return 'record_deleted'
    }
    return 'webhook'
}
