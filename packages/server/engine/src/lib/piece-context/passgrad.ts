import { createHmac, randomBytes } from 'crypto';
import {
  PassgradCapability,
  PassgradRequest,
} from '@activepieces/pieces-framework';

const CAPABILITY_TTL_SECONDS = 90;
const CAPABILITY_ISSUER = 'activepieces-passgrad-engine';

export function createPassgradCapability(
  params: CreatePassgradCapabilityParams
): PassgradCapability {
  const secret = process.env.AP_PASSGRAD_ENGINE_CAPABILITY_SECRET;
  if (!secret) {
    throw new Error('Passgrad engine capability secret is not configured');
  }
  const token = signCapabilityToken({
    projectId: params.projectId,
    pieceName: params.pieceName,
    invocationType: params.invocationType,
    invocationId: randomBytes(24).toString('base64url'),
    secret,
  });
  const endpoint = `${params.apiUrl}v1/internal/passgrad/engine/request`;
  return {
    async request<T = unknown>(request: PassgradRequest): Promise<T> {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        throw new Error(
          `Passgrad capability request failed with status ${response.status}`
        );
      }
      return response.json() as Promise<T>;
    },
  };
}

function signCapabilityToken(params: SignCapabilityTokenParams): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    iss: CAPABILITY_ISSUER,
    sub: 'passgrad-engine-capability',
    iat: issuedAt,
    exp: issuedAt + CAPABILITY_TTL_SECONDS,
    jti: params.invocationId,
    projectId: params.projectId,
    pieceName: params.pieceName,
    invocationType: params.invocationType,
  });
  const signature = createHmac('sha256', params.secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

type CreatePassgradCapabilityParams = {
  apiUrl: string;
  projectId: string;
  pieceName: string;
  invocationType: 'execution' | 'property' | 'trigger';
};

type SignCapabilityTokenParams = {
  secret: string;
  projectId: string;
  pieceName: string;
  invocationType: 'execution' | 'property' | 'trigger';
  invocationId: string;
};
