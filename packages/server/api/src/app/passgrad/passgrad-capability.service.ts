import { createHash } from 'crypto';
import { isPassgradOperationAllowed } from '@activepieces/pieces-framework';
import type {
  PassgradOperation,
  PassgradPieceName,
} from '@activepieces/pieces-framework';
import { safeHttp } from '@activepieces/server-utils';
import { ActivepiecesError, ErrorCode, isNil } from '@activepieces/shared';
import { AxiosRequestConfig, isAxiosError, Method } from 'axios';
import { z } from 'zod';
import { system } from '../helper/system/system';
import { AppSystemProp } from '../helper/system/system-props';
import { passgradProjectBindingService } from './passgrad-project-binding.service';
import { passgradResourceIdSchema } from './passgrad-resource-id';

export function derivePassgradOccurrenceId(
  params: DerivePassgradOccurrenceIdParams
): string {
  const canonical = JSON.stringify([
    'passgrad-occurrence-v1',
    params.flowRunId,
    params.stepName,
    params.executionPath,
  ]);
  return `pgocc_v1_${createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex')}`;
}

export const passgradCapabilityService = {
  async request(params: PassgradCapabilityRequest): Promise<unknown> {
    assertOperationAllowed(params);
    assertWorkflowRecordRequiresExecution(params);
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
          ...trustedExecutionHeaders(params.execution),
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
        if ((error.response?.status ?? 500) >= 500) {
          throw new ActivepiecesError({
            code: ErrorCode.GENERIC_ERROR,
            params: {
              message: `Passgrad capability request failed with status ${
                error.response?.status ?? 500
              }`,
            },
          });
        }
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
    case 'user.list':
      return { method: 'GET', path: '/members' };
    case 'group.list':
      return { method: 'GET', path: '/groups' };
    case 'workflow.list':
      return { method: 'GET', path: '/workflows' };
    case 'table.get-record':
      return resourceRoute(
        params,
        'GET',
        (id) =>
          `/tables/${id}/records/${encodeURIComponent(
            parseIdPayload(recordPayloadIdSchema, params.payload, 'recordId')
          )}`
      );
    case 'table.get-records-by-ids':
      return resourceRoute(
        params,
        'POST',
        (id) => `/tables/${id}/records/batch-get`,
        parseBoundedPayload(
          getRecordsByIdsPayloadSchema,
          params.payload,
          16 * 1024
        )
      );
    case 'table.create-record':
      return resourceRoute(
        params,
        'POST',
        (id) => `/tables/${id}/records`,
        parseRecordPayload(params.payload)
      );
    case 'table.create-workflow-record':
      return resourceRoute(
        params,
        'POST',
        (id) => `/tables/${id}/records/workflow-create`,
        parseBoundedPayload(
          createWorkflowRecordPayloadSchema,
          params.payload,
          16 * 1024
        )
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
        payload: parseCallbackPayload(
          workflowSessionPayloadSchema,
          params.payload,
          16 * 1024
        ),
        callback: true,
      };
    case 'form.project-workflow-run':
      return {
        method: 'POST',
        path: '/callbacks/activepieces/v1/workflow-run-projections',
        payload: parseCallbackPayload(
          workflowRunPayloadSchema,
          params.payload,
          64 * 1024
        ),
        callback: true,
      };
    case 'task.open-workflow-approval':
      return {
        method: 'POST',
        path: '/callbacks/activepieces/v1/workflow-task-created',
        payload: parseCallbackPayload(
          workflowTaskPayloadSchema,
          params.payload,
          64 * 1024
        ),
        callback: true,
      };
    case 'workflow.add-information':
      return {
        method: 'POST',
        path: '/callbacks/activepieces/v1/submission-information',
        payload: trustedCallbackPayload(
          params,
          addInformationPayloadSchema,
          64 * 1024
        ),
        callback: true,
      };
    case 'workflow.complete-process':
      return {
        method: 'POST',
        path: '/callbacks/activepieces/v1/process-completions',
        payload: trustedCallbackPayload(
          params,
          completeProcessPayloadSchema,
          64 * 1024
        ),
        callback: true,
      };
    case 'workflow.open-action-request':
      assertNoEnclosingLoop(params);
      return {
        method: 'POST',
        path: '/callbacks/activepieces/v1/action-requests',
        payload: trustedCallbackPayload(
          params,
          actionRequestPayloadSchema,
          128 * 1024
        ),
        callback: true,
      };
    case 'workflow.open-approval-request':
      assertNoEnclosingLoop(params);
      return {
        method: 'POST',
        path: '/callbacks/activepieces/v1/approval-requests',
        payload: trustedCallbackPayload(
          params,
          approvalRequestPayloadSchema,
          128 * 1024
        ),
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

function trustedExecutionHeaders(
  execution: PassgradTrustedExecution | undefined
): Record<string, string> {
  if (isNil(execution)) {
    return {};
  }
  return {
    'x-passgrad-ap-run-id': execution.runId,
    'x-passgrad-ap-step-id': execution.stepId,
    'x-passgrad-ap-occurrence-id': derivePassgradOccurrenceId({
      flowRunId: execution.runId,
      stepName: execution.stepId,
      executionPath: execution.executionPath,
    }),
  };
}

function capabilityError(message: string): ActivepiecesError {
  return new ActivepiecesError({
    code: ErrorCode.AUTHORIZATION,
    params: { message },
  });
}

const boundedIdSchema = z.string().trim().min(1).max(255);
const recordPayloadIdSchema = z.object({ recordId: boundedIdSchema }).strict();
const getRecordsByIdsPayloadSchema = z
  .object({
    recordIds: z
      .array(passgradResourceIdSchema)
      .min(1)
      .max(100)
      .refine(
        (recordIds) => new Set(recordIds).size === recordIds.length,
        'Record IDs must be unique'
      ),
    missingRecordPolicy: z.literal('fail'),
  })
  .strict();
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

const createWorkflowRecordPayloadSchema = z
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
    output_version: z.enum(['v1', 'v2']).optional(),
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

const workflowSessionPayloadSchema = z
  .object({
    actorUserId: z.string().uuid(),
    formId: passgradResourceIdSchema,
    resumeUrl: z.string().url().max(8192),
    workflowNodeReference: boundedIdSchema,
    workflowReference: boundedIdSchema,
    workflowRunReference: boundedIdSchema,
  })
  .strict();

const workflowRunPayloadSchema = z
  .object({
    apEventSequence: z.number().int().nonnegative(),
    apRunId: boundedIdSchema,
    eventId: boundedIdSchema,
    finishedAt: z.string().datetime().nullable(),
    safeFailureSummary: z.string().max(2000).nullable(),
    result: z.record(z.string(), z.unknown()).nullable(),
    sourceSubmissionId: passgradResourceIdSchema.nullable(),
    startedAt: z.string().datetime().nullable(),
    status: z.enum([
      'pending',
      'running',
      'waiting',
      'succeeded',
      'failed',
      'cancelled',
    ]),
    triggerKind: z.enum([
      'form_submission',
      'record_created',
      'record_updated',
      'record_deleted',
      'schedule',
      'webhook',
      'manual',
    ]),
    type: z.literal('workflow.run.projection.v1'),
    workflowId: passgradResourceIdSchema,
  })
  .strict();

const taskTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), userId: z.string().uuid() }).strict(),
  z
    .object({ type: z.literal('group'), groupId: passgradResourceIdSchema })
    .strict(),
]);

const workflowTaskPayloadSchema = z
  .object({
    apRunId: boundedIdSchema,
    apStepId: boundedIdSchema,
    apTaskId: boundedIdSchema,
    eventId: boundedIdSchema,
    type: z.literal('workflow.task.created.v1'),
    workflowId: passgradResourceIdSchema,
    task: z
      .object({
        type: z.enum(['approval', 'action']),
        title: z.string().trim().min(1).max(200),
        description: z.string().max(4000),
        priority: z.enum(['low', 'normal', 'high']),
        resumeUrl: z.string().url().max(8192).optional(),
        dueAt: z.string().datetime().nullable(),
        targets: z.array(taskTargetSchema).min(1).max(100),
      })
      .strict(),
  })
  .strict();

const addInformationPayloadSchema = z
  .object({
    type: z.literal('workflow.submission-information.appended.v1'),
    eventId: boundedIdSchema,
    sourceSubmissionId: passgradResourceIdSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4000),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

const completeProcessPayloadSchema = z
  .object({
    type: z.literal('workflow.process.completed.v1'),
    eventId: boundedIdSchema,
    sourceSubmissionId: passgradResourceIdSchema,
    resolution: z.enum(['approved', 'rejected', 'cancelled']),
    summary: z.string().max(2000),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

const boundedUniqueUserIdsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(100)
  .refine(
    (userIds) => new Set(userIds).size === userIds.length,
    'User IDs must be unique'
  );
const boundedUniqueGroupIdsSchema = z
  .array(passgradResourceIdSchema)
  .min(1)
  .max(100)
  .refine(
    (groupIds) => new Set(groupIds).size === groupIds.length,
    'Group IDs must be unique'
  );

const workflowActionAssigneeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('source_submitter') }).strict(),
  z
    .object({ type: z.literal('users'), userIds: boundedUniqueUserIdsSchema })
    .strict(),
  z
    .object({
      type: z.literal('groups'),
      groupIds: boundedUniqueGroupIdsSchema,
    })
    .strict(),
]);

const workflowApprovalApproverSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('users'), userIds: boundedUniqueUserIdsSchema })
    .strict(),
  z
    .object({
      type: z.literal('groups'),
      groupIds: boundedUniqueGroupIdsSchema,
    })
    .strict(),
]);

const optionalTaskScheduleShape = {
  priority: z.enum(['low', 'normal', 'high']).optional(),
  dueAt: z.string().datetime().nullable().optional(),
};

const actionRequestPayloadSchema = z
  .object({
    type: z.literal('workflow.action.requested.v1'),
    eventId: boundedIdSchema,
    sourceSubmissionId: passgradResourceIdSchema,
    definition: z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(4000),
        assignee: workflowActionAssigneeSchema,
        fields: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
        policy: z.literal('any'),
      })
      .strict(),
    ...optionalTaskScheduleShape,
    resumeUrl: z.string().url().max(8192),
  })
  .strict();

const approvalRequestPayloadSchema = z
  .object({
    type: z.literal('workflow.approval.requested.v2'),
    eventId: boundedIdSchema,
    definition: z
      .object({
        sourceSubmissionId: passgradResourceIdSchema,
        title: z.string().trim().min(1).max(200),
        description: z.string().max(4000),
        approver: workflowApprovalApproverSchema,
        minimumApprovals: z.number().int().min(1).max(100),
        rejectionPolicy: z.literal('any_rejection'),
        comment: z
          .object({ enabled: z.boolean(), required: z.boolean() })
          .strict()
          .refine(
            (config) => !config.required || config.enabled,
            'Required comments imply enabled comments'
          ),
        attachment: z
          .object({
            enabled: z.boolean(),
            required: z.boolean(),
            maxFiles: z.number().int().min(1).max(10),
          })
          .strict()
          .refine(
            (config) => !config.required || config.enabled,
            'Required attachments imply enabled attachments'
          ),
        ...optionalTaskScheduleShape,
      })
      .strict(),
    resumeUrl: z.string().url().max(8192),
  })
  .strict();

function assertNoEnclosingLoop(params: PassgradCapabilityRequest): void {
  if ((params.execution?.executionPath.length ?? 0) > 0) {
    throw capabilityError('Passgrad waitpoint operations do not support loops');
  }
}

function trustedCallbackPayload<T extends Record<string, unknown>>(
  params: PassgradCapabilityRequest,
  schema: z.ZodType<T>,
  maxBytes: number
): T & {
  execution: {
    apRunId: string;
    apStepId: string;
    apOccurrenceId: string;
  };
} {
  if (isNil(params.execution)) {
    throw capabilityError(
      'Passgrad workflow callback requires execution context'
    );
  }
  const payload = parseBoundedPayload(schema, params.payload, maxBytes);
  return {
    ...payload,
    execution: {
      apRunId: params.execution.runId,
      apStepId: params.execution.stepId,
      apOccurrenceId: derivePassgradOccurrenceId({
        flowRunId: params.execution.runId,
        stepName: params.execution.stepId,
        executionPath: params.execution.executionPath,
      }),
    },
  };
}

function parseCallbackPayload<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  maxBytes: number
): T {
  return parseBoundedPayload(schema, payload, maxBytes);
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

function parseBoundedPayload<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  maxBytes = 256 * 1024
): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw capabilityError('Passgrad capability payload is invalid');
  }
  const serialized = JSON.stringify(parsed.data);
  if (Buffer.byteLength(serialized) > maxBytes) {
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
  execution?: PassgradTrustedExecution;
};

type PassgradTrustedExecution = {
  runId: string;
  stepId: string;
  executionPath: readonly [string, number][];
};

type DerivePassgradOccurrenceIdParams = {
  flowRunId: string;
  stepName: string;
  executionPath: readonly [string, number][];
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

function assertWorkflowRecordRequiresExecution(
  params: PassgradCapabilityRequest
): void {
  if (
    params.operation === 'table.create-workflow-record' &&
    isNil(params.execution)
  ) {
    throw capabilityError(
      'Passgrad workflow record create requires a trusted execution context'
    );
  }
}
