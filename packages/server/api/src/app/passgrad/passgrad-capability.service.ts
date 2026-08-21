import { safeHttp } from '@activepieces/server-utils';
import {
  isPassgradOperationAllowed,
  PassgradOperation,
  PassgradPieceName,
} from '@activepieces/pieces-framework';
import { ActivepiecesError, ErrorCode, isNil } from '@activepieces/shared';
import { AxiosRequestConfig, isAxiosError, Method } from 'axios';
import { z } from 'zod';
import { system } from '../helper/system/system';
import { AppSystemProp } from '../helper/system/system-props';
import { passgradProjectBindingService } from './passgrad-project-binding.service';

export const passgradCapabilityService = {
  async request(params: PassgradCapabilityRequest): Promise<unknown> {
    assertOperationAllowed(params);
    const binding = await passgradProjectBindingService.getCredentials(
      params.projectId
    );
    if (isNil(binding)) {
      throw capabilityError('Project is not bound to Passgrad');
    }
    const apiUrl = system.get(AppSystemProp.PASSGRAD_API_URL);
    if (isNil(apiUrl)) {
      throw capabilityError('Passgrad API URL is not configured');
    }
    const route = buildRoute(params);
    try {
      const response = await safeHttp.axios.request({
        method: route.method,
        url: route.callback
          ? `${apiUrl.replace(/\/$/, '')}${route.path}`
          : `${apiUrl.replace(/\/$/, '')}/tenants/${encodeURIComponent(
              binding.tenantId
            )}${route.path}`,
        headers: {
          'x-passgrad-binding-credential-id': binding.credentialId,
          'x-passgrad-binding-project-id': params.projectId,
          'x-passgrad-binding-secret': binding.callbackSecret,
          ...(route.callback
            ? {
                'x-passgrad-callback-credential-id': binding.credentialId,
                'x-passgrad-callback-secret': binding.callbackSecret,
                'x-passgrad-project-id': params.projectId,
              }
            : {}),
        },
        data: route.payload,
      } satisfies AxiosRequestConfig);
      return response.data === '' ? { acknowledged: true } : response.data;
    } catch (error) {
      if (isAxiosError(error)) {
        throw capabilityError('Passgrad capability request failed');
      }
      throw error;
    }
  },
};

function buildRoute(params: PassgradCapabilityRequest): PassgradRoute {
  switch (params.operation) {
    case 'form.list':
      return { method: 'GET', path: '/forms' };
    case 'table.get-record':
      return resourceRoute(
        params,
        'GET',
        (id) =>
          `/tables/${id}/records/${encodeURIComponent(
            parseIdPayload(recordPayloadIdSchema, params.payload, 'recordId')
          )}`
      );
    case 'table.create-record':
      return resourceRoute(
        params,
        'POST',
        (id) => `/tables/${id}/records`,
        parseRecordPayload(params.payload)
      );
    case 'table.update-record':
      return resourceRoute(
        params,
        'PATCH',
        (id) =>
          `/tables/${id}/records/${encodeURIComponent(
            parseIdPayload(
              updateRecordPayloadSchema,
              params.payload,
              'recordId'
            )
          )}`,
        { values: parseUpdateRecordPayload(params.payload).values }
      );
    case 'table.create-trigger':
      return resourceRoute(
        params,
        'POST',
        (id) => `/tables/${id}/triggers`,
        parseTriggerPayload(params.payload, true)
      );
    case 'table.delete-trigger':
      return resourceRoute(
        params,
        'DELETE',
        (id) =>
          `/tables/${id}/triggers/${encodeURIComponent(
            parseIdPayload(triggerIdPayloadSchema, params.payload, 'triggerId')
          )}`
      );
    case 'table.list-records':
      return resourceRoute(
        params,
        'GET',
        (id) => `/tables/${id}/records?limit=1&sort=-created_at`
      );
    case 'table.list':
      return { method: 'GET', path: '/tables' };
    case 'table.get-fields':
      return resourceRoute(params, 'GET', (id) => `/tables/${id}/fields`);
    case 'form.get-submission':
      return resourceRoute(
        params,
        'GET',
        (id) =>
          `/forms/${id}/submissions/${encodeURIComponent(
            parseIdPayload(
              submissionIdPayloadSchema,
              params.payload,
              'submissionId'
            )
          )}`
      );
    case 'form.create-trigger':
      return resourceRoute(
        params,
        'POST',
        (id) => `/forms/${id}/triggers`,
        parseTriggerPayload(params.payload, false)
      );
    case 'form.delete-trigger':
      return resourceRoute(
        params,
        'DELETE',
        (id) =>
          `/forms/${id}/triggers/${encodeURIComponent(
            parseIdPayload(triggerIdPayloadSchema, params.payload, 'triggerId')
          )}`
      );
    case 'form.list-submissions':
      return resourceRoute(
        params,
        'GET',
        (id) => `/forms/${id}/submissions?limit=1`
      );
    case 'form.open-workflow-session':
      return {
        method: 'POST',
        path: '/callbacks/activepieces/v1/form-workflow-sessions',
        payload: parseCallbackPayload(params.payload),
        callback: true,
      };
    case 'form.project-workflow-run':
      return {
        method: 'POST',
        path: '/callbacks/activepieces/v1/workflow-run-projections',
        payload: parseCallbackPayload(params.payload),
        callback: true,
      };
    case 'task.open-workflow-approval':
      return {
        method: 'POST',
        path: '/callbacks/activepieces/v1/workflow-task-created',
        payload: parseCallbackPayload(params.payload),
        callback: true,
      };
    default:
      throw capabilityError('Passgrad operation is not registered');
  }
}

function resourceRoute(
  params: PassgradCapabilityRequest,
  method: Method,
  path: (resourceId: string) => string,
  payload?: unknown
): PassgradRoute {
  if (
    isNil(params.resourceId) ||
    params.resourceId.length === 0 ||
    params.resourceId.length > 255
  ) {
    throw capabilityError('Passgrad resource ID is required');
  }
  return { method, path: path(encodeURIComponent(params.resourceId)), payload };
}

function capabilityError(message: string): ActivepiecesError {
  return new ActivepiecesError({
    code: ErrorCode.AUTHORIZATION,
    params: { message },
  });
}

const boundedIdSchema = z.string().trim().min(1).max(255);
const recordPayloadIdSchema = z.object({ recordId: boundedIdSchema }).strict();
const submissionIdPayloadSchema = z
  .object({ submissionId: boundedIdSchema })
  .strict();
const triggerIdPayloadSchema = z
  .object({ triggerId: boundedIdSchema })
  .strict();
const recordPayloadSchema = z
  .object({
    values: z.record(z.string(), z.unknown()),
  })
  .strict();

const updateRecordPayloadSchema = z
  .object({
    recordId: z.string().min(1).max(255),
    values: z.record(z.string(), z.unknown()),
  })
  .strict();

const formTriggerPayloadSchema = z
  .object({
    webhook_url: z
      .string()
      .url()
      .max(2048)
      .refine((url) => ['http:', 'https:'].includes(new URL(url).protocol)),
  })
  .strict();

const tableTriggerPayloadSchema = formTriggerPayloadSchema
  .extend({
    event_type: z.enum(['create', 'update', 'delete']),
  })
  .strict();

function parseRecordPayload(payload: unknown): Record<string, unknown> {
  return parseBoundedPayload(recordPayloadSchema, payload);
}

function parseUpdateRecordPayload(payload: unknown): {
  recordId: string;
  values: Record<string, unknown>;
} {
  return parseBoundedPayload(updateRecordPayloadSchema, payload);
}

function parseTriggerPayload(
  payload: unknown,
  table: boolean
): Record<string, unknown> {
  return parseBoundedPayload(
    table ? tableTriggerPayloadSchema : formTriggerPayloadSchema,
    payload
  );
}

const callbackPayloadSchema = z
  .object({
    formId: boundedIdSchema.optional(),
    workflowId: boundedIdSchema.optional(),
    submissionId: boundedIdSchema.optional(),
    apRunId: boundedIdSchema.optional(),
    apStepId: boundedIdSchema.optional(),
    apTaskId: boundedIdSchema.optional(),
    eventId: boundedIdSchema.optional(),
    type: z.string().trim().max(100).optional(),
    status: z.string().trim().max(100).optional(),
    result: z.unknown().optional(),
    task: z.unknown().optional(),
  })
  .strict();

function parseCallbackPayload(payload: unknown): Record<string, unknown> {
  return parseBoundedPayload(callbackPayloadSchema, payload);
}

function parseIdPayload(
  schema: z.ZodType,
  payload: unknown,
  key: string
): string {
  const parsed = parseBoundedPayload(schema, payload);
  if (!isStringRecord(parsed) || typeof parsed[key] !== 'string') {
    throw capabilityError('Passgrad capability payload is invalid');
  }
  return parsed[key];
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && !isNil(value);
}

function parseBoundedPayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw capabilityError('Passgrad capability payload is invalid');
  }
  const serialized = JSON.stringify(parsed.data);
  if (serialized.length > 256 * 1024) {
    throw capabilityError('Passgrad capability payload is too large');
  }
  return parsed.data;
}

type PassgradCapabilityRequest = {
  projectId: string;
  pieceName: PassgradPieceName;
  operation: PassgradOperation;
  resourceId?: string;
  payload?: unknown;
};

type PassgradRoute = {
  method: Method;
  path: string;
  payload?: unknown;
  callback?: boolean;
};

function assertOperationAllowed(params: PassgradCapabilityRequest): void {
  if (!isPassgradOperationAllowed(params.pieceName, params.operation)) {
    throw capabilityError('Passgrad piece cannot perform this operation');
  }
}
