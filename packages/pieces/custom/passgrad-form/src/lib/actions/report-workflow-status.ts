import { createAction, Property } from "@activepieces/pieces-framework";

import { passgradRequest } from "../common";

const workflowIdProperty = Property.ShortText({
  displayName: "Passgrad workflow ID",
  description: "Workflow record that owns this Activepieces Flow.",
  required: true,
});

const sourceSubmissionIdProperty = Property.ShortText({
  displayName: "Source submission ID",
  description: "Optional Form submission ID from the preceding Request submission action.",
  required: false,
});

const triggerKindProperty = Property.StaticDropdown({
  displayName: "Trigger kind",
  description: "Passgrad trigger category that started this run.",
  required: true,
  defaultValue: "manual",
  options: {
    disabled: false,
    options: [
      { label: "Form submission", value: "form_submission" },
      { label: "Record created", value: "record_created" },
      { label: "Record updated", value: "record_updated" },
      { label: "Record deleted", value: "record_deleted" },
      { label: "Schedule", value: "schedule" },
      { label: "Webhook", value: "webhook" },
      { label: "Manual", value: "manual" },
    ],
  },
});

const resultProperty = Property.Json({
  displayName: "Workflow result",
  description: "Optional JSON result persisted with this workflow run.",
  required: false,
});

const statusProperty = Property.StaticDropdown({
  displayName: "Status",
  description: "Operational workflow-run status to project into Passgrad.",
  required: true,
  defaultValue: "succeeded",
  options: {
    disabled: false,
    options: [
      { label: "Running", value: "running" },
      { label: "Succeeded", value: "succeeded" },
    ],
  },
});

const eventSequenceProperty = Property.Number({
  displayName: "Event sequence",
  description: "Monotonic sequence for this Activepieces run projection.",
  required: true,
  defaultValue: 1,
});

export const reportWorkflowStatus = createAction({
  name: "report_workflow_status",
  displayName: "Report workflow status",
  description: "Record this Activepieces Flow run as succeeded in Passgrad.",
  props: {
    source_submission_id: sourceSubmissionIdProperty,
    result: resultProperty,
    status: statusProperty,
    event_sequence: eventSequenceProperty,
    trigger_kind: triggerKindProperty,
    workflow_id: workflowIdProperty,
  },
  async run(context) {
    const sourceSubmissionId = context.propsValue.source_submission_id?.trim() || null;
    const status = context.propsValue.status;
    const eventSequence = context.propsValue.event_sequence;
    const terminal = status === "succeeded";
    await passgradRequest(context, {
      operation: "form.project-workflow-run",
      payload: {
        apEventSequence: eventSequence,
        apRunId: context.run.id,
        eventId:
          status === "succeeded" && eventSequence === 1
            ? `${context.run.id}:succeeded`
            : `${context.run.id}:${eventSequence}:${status}`,
        finishedAt: terminal ? new Date().toISOString() : null,
        safeFailureSummary: null,
        result: context.propsValue.result ?? null,
        sourceSubmissionId,
        startedAt: terminal ? null : new Date().toISOString(),
        status,
        triggerKind: context.propsValue.trigger_kind,
        type: "workflow.run.projection.v1",
        workflowId: context.propsValue.workflow_id,
      },
    });
    return { status, workflowId: context.propsValue.workflow_id };
  },
});
