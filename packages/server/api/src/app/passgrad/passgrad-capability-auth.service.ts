import { ActivepiecesError, ErrorCode, isNil } from '@activepieces/shared';
import { PASSGRAD_PIECE_NAMES } from '@activepieces/pieces-framework';
import { z } from 'zod';
import { jwtUtils } from '../helper/jwt-utils';
import { system } from '../helper/system/system';
import { AppSystemProp } from '../helper/system/system-props';

const capabilityClaimsSchema = z
  .object({
    iss: z.literal('activepieces-passgrad-engine'),
    sub: z.literal('passgrad-engine-capability'),
    iat: z.number().int().positive(),
    exp: z.number().int().positive(),
    jti: z.string().min(16).max(255),
    projectId: z.string().min(1).max(255),
    pieceName: z.enum(PASSGRAD_PIECE_NAMES),
    invocationType: z.enum(['execution', 'property', 'trigger']),
  })
  .strict();

export const passgradCapabilityAuthService = {
  async verifyAuthorizationHeader(
    header: string | string[] | undefined
  ): Promise<PassgradCapabilityClaims> {
    const token = extractBearerToken(header);
    const secret = system.get(AppSystemProp.PASSGRAD_ENGINE_CAPABILITY_SECRET);
    if (isNil(secret)) {
      throw unauthorized();
    }
    try {
      const payload = await jwtUtils.decodeAndVerify<unknown>({
        jwt: token,
        key: secret,
        issuer: 'activepieces-passgrad-engine',
      });
      const claims = capabilityClaimsSchema.parse(payload);
      if (claims.exp <= Math.floor(Date.now() / 1000)) {
        throw unauthorized();
      }
      return claims;
    } catch {
      throw unauthorized();
    }
  },
};

function extractBearerToken(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? undefined : header;
  if (isNil(value)) {
    throw unauthorized();
  }
  const match = /^Bearer\s+(\S+)$/.exec(value);
  if (isNil(match)) {
    throw unauthorized();
  }
  return match[1];
}

function unauthorized(): ActivepiecesError {
  return new ActivepiecesError({
    code: ErrorCode.AUTHENTICATION,
    params: { message: 'Unauthorized' },
  });
}

export type PassgradCapabilityClaims = z.infer<typeof capabilityClaimsSchema>;
