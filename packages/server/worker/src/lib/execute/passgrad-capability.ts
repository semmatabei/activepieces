import { createHmac, randomBytes } from 'node:crypto'

const ISSUER = 'activepieces-passgrad-engine'
export const PASSGRAD_CAPABILITY_GRACE_SECONDS = 15
const SECRET_ENV = 'AP_PASSGRAD_ENGINE_CAPABILITY_SECRET'

export type PassgradCapabilityInvocation = {
    projectId: string
    pieceName: string
    invocationType: 'execution' | 'property' | 'trigger'
    invocationId: string
    flowRunId?: string
    flowVersionId?: string
    stepName?: string
    requestId?: string
    propertyName?: string
    actionOrTriggerName?: string
    hookType?: string
    timeoutInSeconds: number
}

export function assertPassgradCapabilitySecret(secret = process.env[SECRET_ENV]): string {
    if (!secret || Buffer.byteLength(secret) < 32) {
        throw new Error(`${SECRET_ENV} must be configured with at least 32 bytes`)
    }
    return secret
}

export function mintPassgradCapability(params: PassgradCapabilityInvocation): string {
    const secret = assertPassgradCapabilitySecret()
    const issuedAt = Math.floor(Date.now() / 1000)
    const { timeoutInSeconds, ...claims } = params
    const header = encode({ alg: 'HS256', typ: 'JWT' })
    const payload = encode({
        iss: ISSUER,
        sub: 'passgrad-engine-capability',
        iat: issuedAt,
        ...claims,
        exp: issuedAt + timeoutInSeconds + PASSGRAD_CAPABILITY_GRACE_SECONDS,
        jti: params.invocationId,
    })
    const signature = createHmac('sha256', secret)
        .update(`${header}.${payload}`)
        .digest('base64url')
    return `${header}.${payload}.${signature}`
}

export function newPassgradInvocationId(): string {
    return randomBytes(24).toString('base64url')
}

function encode(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url')
}
