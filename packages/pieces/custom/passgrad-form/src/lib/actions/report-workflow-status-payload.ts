/** Pure workflow-run projection payload building logic without Activepieces framework dependencies. */

export interface StoredProjectionTimestamps {
  startedAt: string | null;
  finishedAt: string | null;
}

export interface WorkflowRunProjectionPayloadInput {
  apEventSequence: number;
  apRunId: string;
  status: "running" | "succeeded";
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
  status: "running" | "succeeded";
  triggerKind: string;
  type: "workflow.run.projection.v1";
  workflowId: string;
}

export function buildEventId(
  runId: string,
  status: "running" | "succeeded",
  eventSequence: number,
): string {
  if (status === "succeeded" && eventSequence === 1) {
    return `${runId}:succeeded`;
  }
  return `${runId}:${eventSequence}:${status}`;
}

export function buildStoreKey(
  runId: string,
  stepName: string,
  status: "running" | "succeeded",
  eventSequence: number,
): string {
  return `workflow-projection:${runId}:${stepName}:${status}:${eventSequence}`;
}

export function buildWorkflowRunProjectionPayload(
  input: WorkflowRunProjectionPayloadInput,
): WorkflowRunProjectionPayload {
  const eventId = buildEventId(input.apRunId, input.status, input.eventSequence);
  return {
    apEventSequence: input.apEventSequence,
    apRunId: input.apRunId,
    eventId,
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
