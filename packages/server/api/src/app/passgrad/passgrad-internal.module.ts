import { cryptoUtils } from '@activepieces/server-utils';
import {
  ActivepiecesError,
  DefaultProjectRole,
  ErrorCode,
  isNil,
  PlatformRole,
  PrincipalType,
  Project,
  ProjectType,
  UserIdentityProvider,
  UserStatus,
} from '@activepieces/shared';
import { createHash, timingSafeEqual } from 'crypto';
import dayjs from 'dayjs';
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { accessTokenManager } from '../authentication/lib/access-token-manager';
import { userIdentityService } from '../authentication/user-identity/user-identity-service';
import { securityAccess } from '../core/security/authorization/fastify-security';
import { userRepo } from '../user/user-service';
import { UserSchema } from '../user/user-entity';
import { projectMemberService } from '../ee/projects/project-members/project-member.service';
import { distributedLock } from '../database/redis-connections';
import { platformService } from '../platform/platform.service';
import { projectService } from '../project/project-service';
import { system } from '../helper/system/system';
import { AppSystemProp } from '../helper/system/system-props';
import { passgradEmbedSessionMintService } from './passgrad-embed-session-mint.service';
import { passgradProjectBindingService } from './passgrad-project-binding.service';
import { passgradCapabilityService } from './passgrad-capability.service';

export const passgradInternalModule: FastifyPluginAsyncZod = async (app) => {
  app.post('/projects', projectRequestOptions, async (request) => {
    assertGatewaySecret(request.headers['x-passgrad-provisioning-secret']);
    const project = await getOrCreateProject({
      tenantId: request.body.tenantId,
      displayName: request.body.displayName,
      log: request.log,
    });
    return { projectId: project.id };
  });

  app.post(
    '/projects/:projectId/binding',
    bindingRequestOptions,
    async (request, reply) => {
      assertGatewaySecret(request.headers['x-passgrad-provisioning-secret']);
      const project = await projectService(request.log).getOneOrThrow(
        request.params.projectId
      );
      if (
        project.platformId !==
          requiredSystemProp(AppSystemProp.PASSGRAD_PLATFORM_ID) ||
        project.externalId !== request.body.tenantId
      ) {
        throw unauthorized();
      }
      await passgradProjectBindingService.createOrGet({
        projectId: project.id,
        tenantId: request.body.tenantId,
        provisioningKey: request.body.provisioningKey,
        credentialId: request.body.credentialId,
        callbackSecret: request.body.callbackSecret,
      });
      return reply.code(204).send();
    }
  );

  app.post('/embed-sessions', requestOptions, async (request) => {
    assertGatewaySecret(request.headers['x-passgrad-provisioning-secret']);
    const binding = await passgradProjectBindingService.get(
      request.body.projectId
    );
    if (
      isNil(binding) ||
      binding.provisioningKey !== request.body.provisioningKey
    ) {
      throw unauthorized();
    }
    const mint = await passgradEmbedSessionMintService.createOrGet({
      projectId: request.body.projectId,
      passgradUserId: request.body.userId,
      idempotencyKey: request.body.idempotencyKey,
    });
    const user = await getOrCreateEmbedUser({
      apUserId: mint.apUserId,
      passgradUserId: mint.passgradUserId,
      platformId: binding.project?.platformId,
    });
    await projectMemberService(request.log).upsert({
      projectId: binding.projectId,
      userId: user.id,
      projectRoleName: DefaultProjectRole.EDITOR,
    });
    const identity = await userIdentityService(request.log).getOneOrFail({
      id: user.identityId,
    });
    const expiresInSeconds = dayjs.duration(5, 'minute').asSeconds();
    const accessToken = await accessTokenManager(request.log).generateToken(
      {
        id: user.id,
        type: PrincipalType.USER,
        platform: { id: user.platformId! },
        projectId: binding.projectId,
        tokenVersion: identity.tokenVersion,
      },
      expiresInSeconds
    );
    return {
      accessToken,
      expiresAt: dayjs().add(expiresInSeconds, 'second').toISOString(),
      projectId: binding.projectId,
    };
  });

  app.post('/engine/request', engineRequestOptions, async (request) => {
    return passgradCapabilityService.request({
      projectId: request.principal.projectId,
      pieceName: request.body.pieceName,
      operation: request.body.operation,
      resourceId: request.body.resourceId,
      payload: request.body.payload,
    });
  });
};

async function getOrCreateProject(params: {
  tenantId: string;
  displayName: string;
  log: import('fastify').FastifyBaseLogger;
}) {
  let result: Project | undefined;
  await distributedLock(params.log).runExclusive({
    key: `passgrad-project:${params.tenantId}`,
    timeoutInSeconds: 30,
    fn: async () => {
      const platformId = requiredSystemProp(AppSystemProp.PASSGRAD_PLATFORM_ID);
      const existing = await projectService(
        params.log
      ).getByPlatformIdAndExternalId({
        platformId,
        externalId: params.tenantId,
      });
      if (!isNil(existing)) {
        result = existing;
        return;
      }
      const platform = await platformService(params.log).getOneOrThrow(
        platformId
      );
      result = await projectService(params.log).create({
        displayName: params.displayName,
        ownerId: platform.ownerId,
        platformId,
        type: ProjectType.TEAM,
        externalId: params.tenantId,
      });
    },
  });
  if (isNil(result)) throw new Error('Passgrad project was not created');
  return result;
}

async function getOrCreateEmbedUser(params: {
  apUserId: string;
  passgradUserId: string;
  platformId: string | undefined;
}) {
  if (isNil(params.platformId)) throw unauthorized();
  const existing = await userRepo().findOneBy({ id: params.apUserId });
  if (!isNil(existing)) return existing;
  const email = `${createHash('sha256')
    .update(params.apUserId)
    .digest('hex')}@passgrad.invalid`;
  let identity = await userIdentityService(
    system.globalLogger()
  ).getIdentityByEmail(email);
  if (isNil(identity)) {
    identity = await userIdentityService(system.globalLogger()).create({
      email,
      password: await cryptoUtils.generateRandomPassword(),
      firstName: 'Passgrad',
      lastName: 'Member',
      trackEvents: false,
      newsLetter: false,
      provider: UserIdentityProvider.JWT,
      verified: true,
    });
  }
  const created = new Date().toISOString();
  const newUser = {
    id: params.apUserId,
    identityId: identity.id,
    platformId: params.platformId,
    externalId: params.passgradUserId,
    platformRole: PlatformRole.MEMBER,
    status: UserStatus.ACTIVE,
    created,
    updated: created,
  } satisfies Omit<UserSchema, 'projects' | 'identity' | 'badges'>;
  return userRepo().save(newUser);
}

function assertGatewaySecret(header: string | string[] | undefined): void {
  const provided = Array.isArray(header) ? undefined : header;
  const expected = system.get(AppSystemProp.PASSGRAD_PROVISIONING_SECRET);
  if (
    isNil(provided) ||
    isNil(expected) ||
    Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  )
    throw unauthorized();
}

function unauthorized(): ActivepiecesError {
  return new ActivepiecesError({
    code: ErrorCode.AUTHENTICATION,
    params: { message: 'Unauthorized' },
  });
}

function requiredSystemProp(prop: AppSystemProp): string {
  const value = system.get(prop);
  if (isNil(value))
    throw new ActivepiecesError({
      code: ErrorCode.SYSTEM_PROP_INVALID,
      params: { prop },
    });
  return value;
}

const requestOptions = {
  config: { security: securityAccess.public() },
  schema: {
    body: z.object({
      projectId: z.string().min(1),
      userId: z.string().uuid(),
      idempotencyKey: z.string().uuid(),
      provisioningKey: z.string().uuid(),
    }),
  },
};
const projectRequestOptions = {
  config: { security: securityAccess.public() },
  schema: {
    body: z.object({
      tenantId: z.string().uuid(),
      displayName: z.string().trim().min(1).max(255),
      idempotencyKey: z.string().uuid(),
    }),
  },
};
const bindingRequestOptions = {
  config: { security: securityAccess.public() },
  schema: {
    params: z.object({ projectId: z.string().min(1) }),
    body: z.object({
      tenantId: z.string().uuid(),
      provisioningKey: z.string().uuid(),
      credentialId: z.string().uuid(),
      callbackSecret: z.string().min(32).max(4096),
    }),
  },
};
const engineRequestOptions = {
  config: { security: securityAccess.engine() },
  schema: {
    body: z.object({
      pieceName: z.enum([
        '@activepieces/piece-passgrad-table',
        '@activepieces/piece-passgrad-form',
      ]),
      operation: z.enum([
        'table.get-record',
        'table.create-record',
        'table.update-record',
        'table.create-trigger',
        'table.delete-trigger',
        'table.list-records',
        'form.get-submission',
        'form.create-trigger',
        'form.delete-trigger',
        'form.list-submissions',
        'form.open-workflow-session',
        'form.project-workflow-run',
        'task.open-workflow-approval',
      ]),
      resourceId: z.string().min(1).optional(),
      payload: z.unknown().optional(),
    }),
  },
};
