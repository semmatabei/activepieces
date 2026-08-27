function buildEventId(input: {
  runId: string;
  status: WorkflowProjectionStatus;
  eventSequence: number;
}): string {
  if (input.status === "succeeded" && input.eventSequence === 1) {
    return `${input.runId}:succeeded`;
  }
  return `${input.runId}:${input.eventSequence}:${input.status}`;
}

function buildStoreKey(input: {
  runId: string;
  stepName: string;
  status: WorkflowProjectionStatus;
  eventSequence: number;
}): string {
  return `workflow-projection:${input.runId}:${input.stepName}:${input.status}:${input.eventSequence}`;
}

async function getOrCreateTimestamps(input: {
  store: ProjectionTimestampStore;
  storeKey: string;
  status: WorkflowProjectionStatus;
  now: string;
}): Promise<StoredProjectionTimestamps> {
  const stored = await input.store.get<StoredProjectionTimestamps>(input.storeKey);
  if (stored) return stored;

  const timestamps: StoredProjectionTimestamps = {
    startedAt: input.status === "succeeded" ? null : input.now,
    finishedAt: input.status === "succeeded" ? input.now : null,
  };
  await input.store.put(input.storeKey, timestamps);
  return timestamps;
}

function buildWorkflowRunProjectionPayload(
  input: WorkflowRunProjectionPayloadInput,
): WorkflowRunProjectionPayload {
  return {
    apEventSequence: input.apEventSequence,
    apRunId: input.apRunId,
    eventId: buildEventId({
      runId: input.apRunId,
      status: input.status,
      eventSequence: input.eventSequence,
    }),
    finishedAt: input.finishedAt,
    safeFailureSummary: null,
    result: input.result,
    sourceSubmissionId: input.sourceSubmissionId,
    startedAt: input.startedAt,
    status: input.status,
    triggerKind: input.triggerKind,
    type: "workflow.run.projection.v1",
    workflowId: input.workflowId,
  };
}

export const workflowRunProjectionPayloadUtils = {
  buildEventId,
  buildStoreKey,
  buildWorkflowRunProjectionPayload,
  getOrCreateTimestamps,
};

export type WorkflowProjectionStatus = "running" | "succeeded";

export interface StoredProjectionTimestamps {
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ProjectionTimestampStore {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T): Promise<T>;
}

export interface WorkflowRunProjectionPayloadInput {
  apEventSequence: number;
  apRunId: string;
  status: WorkflowProjectionStatus;
  eventSequence: number;
  triggerKind: string;
  workflowId: string;
  sourceSubmissionId: string | null;
  result: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface WorkflowRunProjectionPayload {
  apEventSequence: number;
  apRunId: string;
  eventId: string;
  finishedAt: string | null;
  safeFailureSummary: null;
  result: Record<string, unknown> | null;
  sourceSubmissionId: string | null;
  startedAt: string | null;
  status: WorkflowProjectionStatus;
  triggerKind: string;
  type: "workflow.run.projection.v1";
  workflowId: string;
}
