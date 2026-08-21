import { z } from 'zod';
import { PASSGRAD_OPERATION_SCHEMA } from '@activepieces/pieces-framework';

export const passgradEngineRequestSchema = z
  .object({
    operation: PASSGRAD_OPERATION_SCHEMA,
    resourceId: z.string().min(1).max(255).optional(),
    payload: z.unknown().optional(),
  })
  .strict();
