import { createTrigger, TriggerStrategy } from "@activepieces/pieces-framework";
import { tableIdProperty, passgradRequest } from "../common";

export const deletedRecord = createTrigger({
  name: "deleted_record",
  displayName: "Deleted Record",
  description: "Triggers when a record is deleted from the selected Passgrad table.",
  type: TriggerStrategy.WEBHOOK,
  props: { table_id: tableIdProperty },
  sampleData: {
    record_id: "rec_abc123",
    table_id: "tb_mahasiswa",
    deleted_at: "2025-06-26T16:00:00Z",
    data: { f_mhs_nama: "Ahmad Fauzi", f_mhs_status: "tidak_aktif" },
  },

  async onEnable(context) {
    const response = await passgradRequest<{ data: { id: string } }>(context, {
      operation: "table.create-trigger",
      payload: { event_type: "delete", webhook_url: context.webhookUrl },
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
