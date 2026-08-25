import { PASSGRAD_OPERATION_SCHEMA } from '@activepieces/pieces-framework'
import { z } from 'zod'

const executionPathEntrySchema = z.tuple([
    z.string().min(1).max(255),
    z.number().int().min(0),
])

export const passgradEngineRequestSchema = z
    .object({
        operation: PASSGRAD_OPERATION_SCHEMA,
        resourceId: z.string().min(1).max(255).optional(),
        payload: z.unknown().optional(),
        executionPath: z.array(executionPathEntrySchema).max(32).optional(),
    })
    .strict()
