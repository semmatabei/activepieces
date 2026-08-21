import { createTrigger, TriggerStrategy } from "@activepieces/pieces-framework";
import { tableIdProperty, passgradRequest } from "../common";

const sampleData = {
  record_id: "rec_abc123",
  table_id: "tb_mahasiswa",
  created_at: "2025-06-26T12:00:00Z",
  data: { f_mhs_nama: "Ahmad Fauzi", f_mhs_status: "aktif" },
};

/**
 * Trigger: New Record — fires when a record is created in the selected table.
 * Registers the Flow-specific webhook URL with Passgrad and removes it on disable.
 */
export const newRecord = createTrigger({
  name: "new_record",
  displayName: "New Record",
  description: "Triggers when a new record is created in the selected Passgrad table.",
  type: TriggerStrategy.WEBHOOK,
  props: { table_id: tableIdProperty },
  sampleData,

  async onEnable(context) {
    const response = await passgradRequest<{ data: { id: string } }>(context, {
      operation: "table.create-trigger",
      payload: { event_type: "create", webhook_url: context.webhookUrl },
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

  async test(context) {
    try {
      const response = await passgradRequest<{ data: unknown[] }>(context, {
        operation: "table.list-records",
        resourceId: context.propsValue.table_id,
      });
      if (response.data.length > 0) return [response.data[0]];
    } catch {
      /* fall through */
    }
    return [sampleData];
  },
});
