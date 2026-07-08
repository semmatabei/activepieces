import { createTrigger, TriggerStrategy } from "@activepieces/pieces-framework";
import { passgradAuth, tableIdProperty, passgradRequest } from "../common";
import { HttpMethod } from "@activepieces/pieces-common";

export const updatedRecord = createTrigger({
  auth: passgradAuth,
  name: "updated_record",
  displayName: "Updated Record",
  description: "Triggers when a record is updated in the selected Passgrad table.",
  type: TriggerStrategy.APP_WEBHOOK,
  props: { table_id: tableIdProperty },
  sampleData: {
    record_id: "rec_abc123",
    table_id: "tb_mahasiswa",
    updated_at: "2025-06-26T14:30:00Z",
    changes: { f_mhs_status: { old: "aktif", new: "tidak_aktif" } },
  },

  async onEnable(context) {
    const response = await passgradRequest<{ trigger: { id: string } }>(
      context.auth,
      HttpMethod.POST,
      `/tables/${context.propsValue.table_id}/triggers`,
      { webhook_url: context.webhookUrl, event_type: "update" },
    );
    await context.store.put("passgrad_trigger_id", response.body.trigger.id);
  },

  async onDisable(context) {
    const triggerId = await context.store.get<string>("passgrad_trigger_id");
    if (triggerId) {
      await passgradRequest(
        context.auth,
        HttpMethod.DELETE,
        `/tables/${context.propsValue.table_id}/triggers/${triggerId}`,
      );
    }
  },

  async run(context) {
    return [context.payload.body];
  },
});
