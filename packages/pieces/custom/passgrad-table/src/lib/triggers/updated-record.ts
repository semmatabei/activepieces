import { createTrigger, TriggerStrategy } from "@activepieces/pieces-framework";
import { tableIdProperty, passgradRequest } from "../common";

export const updatedRecord = createTrigger({
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
    const response = await passgradRequest<{ data: { id: string } }>(context, {
      operation: "table.create-trigger",
      payload: { event_type: "update", webhook_url: context.webhookUrl },
      resourceId: context.propsValue.table_id,
    });
    await context.store.put("passgrad_trigger_id", response.data.id);
  },

  async onDisable(context) {
    const triggerId = await context.store.get<string>("passgrad_trigger_id");
    if (triggerId) {
      await passgradRequest(context, {
        operation: "table.delete-trigger",
        payload: { triggerId },
        resourceId: context.propsValue.table_id,
      });
    }
  },

  async run(context) {
    return [context.payload.body];
  },
});
