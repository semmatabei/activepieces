import { z } from 'zod'

const PASSGRAD_RESOURCE_ID_REGEX = /^[0-7][0123456789abcdefghjkmnpqrstvwxyz]{25}$/

export const passgradResourceIdSchema = z.string().regex(
    PASSGRAD_RESOURCE_ID_REGEX,
)
