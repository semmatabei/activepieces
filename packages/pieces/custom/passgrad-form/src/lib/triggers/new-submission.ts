import { createTrigger, TriggerStrategy } from "@activepieces/pieces-framework";
import { passgradAuth, formIdProperty, passgradRequest } from "../common";
import { HttpMethod } from "@activepieces/pieces-common";

/**
 * Trigger: New Submission
 *
 * Fires when a user submits the selected Passgrad form.
 * Uses APP_WEBHOOK strategy — onEnable registers the webhook URL
 * with Passgrad's API, onDisable removes it.
 *
 * Lifecycle:
 * 1. onEnable → POST /v1/forms/:formId/triggers { webhook_url }
 * 2. User submits form → Passgrad POSTs payload to webhook_url
 * 3. run() receives the payload → returns it as flow trigger event
 * 4. onDisable → DELETE /v1/forms/:formId/triggers/:triggerId
 */
export const newSubmission = createTrigger({
  auth: passgradAuth,
  name: "new_submission",
  displayName: "New Submission",
  description: "Triggers when a new submission is received on the selected Passgrad form.",
  type: TriggerStrategy.APP_WEBHOOK,
  props: {
    form_id: formIdProperty,
  },
  sampleData: {
    submission_id: "fs_abc123",
    form_id: "form_leave",
    submitted_by: "Bagus Pratama",
    submitted_at: "2025-06-26T12:00:00Z",
    data: {
      nama: "Bagus Pratama",
      jenis: "Cuti Tahunan",
      tgl_mulai: "2025-07-01",
      tgl_selesai: "2025-07-03",
      alasan: "Liburan keluarga",
    },
  },

  async onEnable(context) {
    const formId = context.propsValue.form_id;
    const webhookUrl = context.webhookUrl;

    // Register the webhook with Passgrad
    const response = await passgradRequest<{ trigger: { id: string } }>(
      context.auth,
      HttpMethod.POST,
      `/forms/${formId}/triggers`,
      { webhook_url: webhookUrl },
    );

    // Store the trigger ID so we can clean it up on disable
    await context.store.put("passgrad_trigger_id", response.body.trigger.id);
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
    // The webhook payload arrives from Passgrad backend.
    // It contains the full form submission.
    return [context.payload.body];
  },

  async test(context) {
    // Test: simulate by fetching the latest submission (if any),
    // or return sample data if no submissions exist.
    try {
      const response = await passgradRequest<{ submissions: unknown[] }>(
        context.auth,
        HttpMethod.GET,
        `/forms/${context.propsValue.form_id}/submissions?limit=1`,
      );

      if (response.body.submissions.length > 0) {
        return [response.body.submissions[0]];
      }
    } catch {
      // Fall through to sample data
    }

    // Return sample data as fallback
    return [context.trigger.sampleData];
  },
});
