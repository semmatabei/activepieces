import { createTrigger, TriggerStrategy } from "@activepieces/pieces-framework";
import { passgradAuth, formIdProperty, passgradRequest } from "../common";
import { HttpMethod } from "@activepieces/pieces-common";

const sampleData = {
  event: "form.submitted.v1",
  formId: "019c70d8-e000-7000-8000-000000000001",
  submissionId: "019c70d8-e000-7000-8000-000000000002",
};

/**
 * Trigger: New Submission
 *
 * Fires when a user submits the selected Passgrad form.
 * Uses APP_WEBHOOK strategy — onEnable registers the webhook URL
 * with Passgrad's API, onDisable removes it.
 *
 * Lifecycle:
 * 1. onEnable → POST /tenants/:tenantId/forms/:formId/triggers { webhook_url }
 * 2. User submits form → Passgrad POSTs immutable submission reference to webhook_url
 * 3. run() receives the reference → use Get Submission action to load payload
 * 4. onDisable → DELETE /v1/forms/:formId/triggers/:triggerId
 */
export const newSubmission = createTrigger({
  auth: passgradAuth,
  name: "new_submission",
  displayName: "New Submission",
  description:
    "Triggers when a new submission is received. Use Get Submission to retrieve its payload.",
  type: TriggerStrategy.APP_WEBHOOK,
  props: {
    form_id: formIdProperty,
  },
  sampleData,

  async onEnable(context) {
    const formId = context.propsValue.form_id;
    const webhookUrl = context.webhookUrl;

    // Register the webhook with Passgrad
    const response = await passgradRequest<{ data: { id: string } }>(
      context.auth,
      HttpMethod.POST,
      `/forms/${formId}/triggers`,
      { webhook_url: webhookUrl },
    );

    // Store the trigger ID so we can clean it up on disable
    await context.store.put("passgrad_trigger_id", response.body.data.id);
  },

  async onDisable(context) {
    const formId = context.propsValue.form_id;
    const triggerId = await context.store.get<string>("passgrad_trigger_id");

    if (triggerId) {
      await passgradRequest(
        context.auth,
        HttpMethod.DELETE,
        `/forms/${formId}/triggers/${triggerId}`,
      );
    }
  },

  async run(context) {
    return [context.payload.body];
  },

  async test(context) {
    // Test: simulate by fetching the latest submission (if any),
    // or return sample data if no submissions exist.
    try {
      const response = await passgradRequest<{ data: unknown[] }>(
        context.auth,
        HttpMethod.GET,
        `/forms/${context.propsValue.form_id}/submissions?limit=1`,
      );

      if (response.body.data.length > 0) {
        return [response.body.data[0]];
      }
    } catch {
      // Fall through to sample data
    }

    // Return sample data as fallback
    return [sampleData];
  },
});
