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

/** Projects a terminal Activepieces run after downstream Form processing completes. */
export const reportWorkflowStatus = createAction({
  name: "report_workflow_status",
  displayName: "Report workflow status",
  description: "Record this Activepieces Flow run as succeeded in Passgrad.",
  props: {
    source_submission_id: sourceSubmissionIdProperty,
    result: resultProperty,
    trigger_kind: triggerKindProperty,
    workflow_id: workflowIdProperty,
  },
  async run(context) {
    const sourceSubmissionId = context.propsValue.source_submission_id?.trim() || null;
    await passgradRequest(context, {
      operation: "form.project-workflow-run",
      payload: {
        apEventSequence: 1,
        apRunId: context.run.id,
        eventId: `${context.run.id}:succeeded`,
        finishedAt: new Date().toISOString(),
        safeFailureSummary: null,
        result: context.propsValue.result ?? null,
        sourceSubmissionId,
        startedAt: null,
        status: "succeeded",
        triggerKind: context.propsValue.trigger_kind,
        type: "workflow.run.projection.v1",
        workflowId: context.propsValue.workflow_id,
      },
    });
    return { status: "succeeded", workflowId: context.propsValue.workflow_id };
  },
});
