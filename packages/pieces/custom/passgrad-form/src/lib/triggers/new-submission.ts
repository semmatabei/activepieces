import { createTrigger, TriggerStrategy } from "@activepieces/pieces-framework";
import { formIdProperty, passgradRequest } from "../common";

const sampleData = {
  event: "form.submitted.v1",
  formId: "019c70d8-e000-7000-8000-000000000001",
  submissionId: "019c70d8-e000-7000-8000-000000000002",
};

/**
 * Trigger: New Submission
 *
 * Fires when a user submits the selected Passgrad form.
 * Registers the Flow-specific webhook URL and keeps its Passgrad trigger ID in Flow storage.
 */
export const newSubmission = createTrigger({
  name: "new_submission",
  displayName: "New Submission",
  description:
    "Triggers when a new submission is received. Use Get Submission to retrieve its payload.",
  type: TriggerStrategy.WEBHOOK,
  props: {
    form_id: formIdProperty,
  },
  sampleData,

  async onEnable(context) {
    const formId = context.propsValue.form_id;
    const webhookUrl = context.webhookUrl;

    const response = await passgradRequest<{ data: { id: string } }>(context, {
      operation: "form.create-trigger",
      payload: { webhook_url: webhookUrl },
      resourceId: formId,
    });

    await context.store.put("passgrad_trigger_id", response.data.id);
  },

  async onDisable(context) {
    const formId = context.propsValue.form_id;
    const triggerId = await context.store.get<string>("passgrad_trigger_id");

    if (triggerId) {
      await passgradRequest(context, {
        operation: "form.delete-trigger",
        payload: { triggerId },
        resourceId: formId,
      });
    }
  },

  async run(context) {
    return [context.payload.body];
  },

  async test(context) {
    // Test: simulate by fetching the latest submission (if any),
    // or return sample data if no submissions exist.
    try {
      const response = await passgradRequest<{ data: unknown[] }>(context, {
        operation: "form.list-submissions",
        resourceId: context.propsValue.form_id,
      });

      if (response.data.length > 0) {
        return [response.data[0]];
      }
    } catch {
      // Fall through to sample data
    }

    // Return sample data as fallback
    return [sampleData];
  },
});
