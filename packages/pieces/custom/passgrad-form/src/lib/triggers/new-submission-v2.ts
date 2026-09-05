import { createTrigger, Property, TriggerStrategy } from "@activepieces/pieces-framework";
import { formIdProperty, passgradRequest } from "../common";

const sampleSubmission = {
  data: {},
  formId: "01khrdhr00e008000000000001",
  formVersionId: "01khrdhr00e008000000000003",
  id: "01khrdhr00e008000000000002",
  submittedAt: "2026-08-26T00:00:00.000Z",
  submittedByUserId: null,
};

const sampleData = {
  eventId: "passgrad-form-submission-v2-sample",
  submission: sampleSubmission,
  type: "form.submitted.v2",
};

/** Emits the immutable submission snapshot committed by Passgrad. */
export const newSubmissionV2 = createTrigger({
  name: "new_submission_v2",
  displayName: "New Submission",
  description: "Triggers with the complete immutable submission snapshot.",
  type: TriggerStrategy.WEBHOOK,
  props: {
    form_id: formIdProperty,
    mark_submission_actionable: Property.Checkbox({
      displayName: "Add to Submissions",
      description: "Expose this submission in the workflow-backed Submissions view.",
      defaultValue: true,
      required: false,
    }),
  },
  sampleData,

  async onEnable(context) {
    const response = await passgradRequest<{ data: { id: string } }>(context, {
      operation: "form.create-trigger",
      payload: {
        output_version: "v2",
        webhook_url: context.webhookUrl,
        mark_submission_actionable: context.propsValue.mark_submission_actionable ?? true,
      },
      resourceId: context.propsValue.form_id,
    });
    await context.store.put("passgrad_trigger_id", response.data.id);
  },

  async onDisable(context) {
    const triggerId = await context.store.get<string>("passgrad_trigger_id");
    if (!triggerId) return;
    await passgradRequest(context, {
      operation: "form.delete-trigger",
      payload: { triggerId },
      resourceId: context.propsValue.form_id,
    });
  },

  async run(context) {
    return [context.payload.body];
  },

  async test(context) {
    try {
      const response = await passgradRequest<{ data: Array<typeof sampleSubmission> }>(context, {
        operation: "form.list-submissions",
        resourceId: context.propsValue.form_id,
      });
      const submission = response.data[0];
      if (submission) {
        return [
          {
            eventId: `passgrad-form-submission-test:${submission.id}`,
            submission,
            type: "form.submitted.v2",
          },
        ];
      }
    } catch {
      // Editor test data remains schema-identical when no live submission is available.
    }
    return [sampleData];
  },
});
