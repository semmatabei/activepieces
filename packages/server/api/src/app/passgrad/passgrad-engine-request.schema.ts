import { z } from 'zod'

export const passgradEngineRequestSchema = z.object({
    pieceName: z.enum([
        '@activepieces/piece-passgrad-table',
        '@activepieces/piece-passgrad-form',
    ]),
    operation: z.enum([
        'form.list',
        'table.get-record',
        'table.create-record',
        'table.update-record',
        'table.create-trigger',
        'table.delete-trigger',
        'table.list-records',
        'table.list',
        'table.get-fields',
        'form.get-submission',
        'form.create-trigger',
        'form.delete-trigger',
        'form.list-submissions',
        'form.open-workflow-session',
        'form.project-workflow-run',
        'task.open-workflow-approval',
    ]),
    resourceId: z.string().min(1).max(255).optional(),
    payload: z.unknown().optional(),
}).strict()
