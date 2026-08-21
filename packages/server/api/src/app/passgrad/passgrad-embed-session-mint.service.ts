import {
  ActivepiecesError,
  apId,
  ErrorCode,
  isNil,
} from '@activepieces/shared';
import { repoFactory } from '../core/db/repo-factory';
import { passgradProjectBindingService } from './passgrad-project-binding.service';
import {
  PassgradEmbedSessionMintEntity,
  PassgradEmbedSessionMintSchema,
} from './passgrad-embed-session-mint.entity';

const passgradEmbedSessionMintRepo = repoFactory(
  PassgradEmbedSessionMintEntity
);

export const passgradEmbedSessionMintService = {
  async createOrGet(
    params: CreatePassgradEmbedSessionMintParams
  ): Promise<PassgradEmbedSessionMintSchema> {
    await assertProjectIsBound(params.projectId);

    const existing = await findByIdempotencyKey(params);
    if (!isNil(existing)) {
      return existing;
    }

    const mint = {
      id: apId(),
      created: new Date(),
      updated: new Date(),
      projectId: params.projectId,
      passgradUserId: params.passgradUserId,
      idempotencyKey: params.idempotencyKey,
      apUserId: apId(),
      apSessionId: apId(),
    } satisfies PassgradEmbedSessionMintSchema;
    await passgradEmbedSessionMintRepo()
      .createQueryBuilder()
      .insert()
      .values(mint)
      .orIgnore()
      .execute();

    const saved = await findByIdempotencyKey(params);
    if (isNil(saved)) {
      throw new Error('Passgrad embed session mint was not persisted');
    }
    return saved;
  },
};

async function assertProjectIsBound(projectId: string): Promise<void> {
  const binding = await passgradProjectBindingService.getActive(projectId);
  if (!isNil(binding)) {
    return;
  }
  throw new ActivepiecesError({
    code: ErrorCode.VALIDATION,
    params: { message: 'Project is not bound to Passgrad' },
  });
}

async function findByIdempotencyKey(
  params: CreatePassgradEmbedSessionMintParams
): Promise<PassgradEmbedSessionMintSchema | null> {
  return passgradEmbedSessionMintRepo().findOneBy({
    projectId: params.projectId,
    passgradUserId: params.passgradUserId,
    idempotencyKey: params.idempotencyKey,
  });
}

type CreatePassgradEmbedSessionMintParams = {
  projectId: string;
  passgradUserId: string;
  idempotencyKey: string;
};
