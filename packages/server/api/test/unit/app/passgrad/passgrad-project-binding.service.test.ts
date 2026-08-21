import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repo: {
    findOne: vi.fn(),
    findOneBy: vi.fn(),
    createQueryBuilder: vi.fn(),
  },
  decryptObject: vi.fn(),
  systemGet: vi.fn(),
}));

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
  repoFactory: () => () => mocks.repo,
}));
vi.mock('../../../../src/app/helper/encryption', () => ({
  encryptUtils: {
    decryptObject: mocks.decryptObject,
    encryptObject: vi.fn(),
  },
}));
vi.mock('../../../../src/app/helper/system/system', () => ({
  system: {
    get: mocks.systemGet,
  },
}));

import { passgradProjectBindingService } from '../../../../src/app/passgrad/passgrad-project-binding.service';

describe('passgradProjectBindingService.getCredentials', () => {
  beforeEach(() => {
    mocks.repo.findOne.mockReset();
    mocks.decryptObject.mockReset();
    mocks.systemGet.mockReturnValue('platform-1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { project: undefined, tenantId: 'tenant-1', status: 'ACTIVE' },
    {
      project: {
        id: 'project-1',
        externalId: 'tenant-1',
        platformId: 'platform-1',
        deleted: null,
      },
      tenantId: 'tenant-1',
      status: 'REVOKED',
    },
    {
      project: {
        id: 'other-project',
        externalId: 'tenant-1',
        platformId: 'platform-1',
        deleted: null,
      },
      tenantId: 'tenant-1',
    },
    {
      project: {
        id: 'project-1',
        externalId: 'other-tenant',
        platformId: 'platform-1',
        deleted: null,
      },
      tenantId: 'tenant-1',
    },
    {
      project: {
        id: 'project-1',
        externalId: 'tenant-1',
        platformId: 'other-platform',
        deleted: null,
      },
      tenantId: 'tenant-1',
    },
    {
      project: {
        id: 'project-1',
        externalId: 'tenant-1',
        platformId: 'platform-1',
        deleted: new Date(),
      },
      tenantId: 'tenant-1',
    },
  ])('fails closed for invalid binding state', async (binding) => {
    mocks.repo.findOne.mockResolvedValue({
      projectId: 'project-1',
      tenantId: binding.tenantId,
      credentials: { iv: 'iv', data: 'data' },
      status: binding.status,
      project: binding.project,
    });

    await expect(
      passgradProjectBindingService.getCredentials('project-1')
    ).resolves.toBeNull();
    expect(mocks.decryptObject).not.toHaveBeenCalled();
  });

  it('decrypts credentials only after binding integrity checks pass', async () => {
    mocks.repo.findOne.mockResolvedValue({
      projectId: 'project-1',
      tenantId: 'tenant-1',
      credentials: { iv: 'iv', data: 'data' },
      status: 'ACTIVE',
      project: {
        id: 'project-1',
        externalId: 'tenant-1',
        platformId: 'platform-1',
        deleted: null,
      },
    });
    mocks.decryptObject.mockResolvedValue({
      callbackSecret: 'secret',
      credentialId: 'credential',
    });

    await expect(
      passgradProjectBindingService.getCredentials('project-1')
    ).resolves.toEqual({
      callbackSecret: 'secret',
      credentialId: 'credential',
      tenantId: 'tenant-1',
    });
    expect(mocks.decryptObject).toHaveBeenCalledTimes(1);
  });
});
