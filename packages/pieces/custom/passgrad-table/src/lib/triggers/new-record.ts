import { createTrigger, TriggerStrategy } from "@activepieces/pieces-framework";
import { passgradAuth, tableIdProperty } from "../common";

const sampleData = {
  record_id: "rec_abc123",
  table_id: "tb_mahasiswa",
  created_at: "2025-06-26T12:00:00Z",
  data: { f_mhs_nama: "Ahmad Fauzi", f_mhs_status: "aktif" },
};

/**
 * Trigger: New Record — fires when a record is created in the selected table.
 * Uses WEBHOOK: onEnable registers webhook with Passgrad, onDisable removes it.
 */
export const newRecord = createTrigger({
  auth: passgradAuth,
  name: "new_record",
  displayName: "New Record",
  description: "Triggers when a new record is created in the selected Passgrad table.",
  type: TriggerStrategy.WEBHOOK,
  props: { table_id: tableIdProperty },
  sampleData,

  async onEnable(context) {
    const response = await context.passgrad.request<{ data: { id: string } }>({ operation: "table.create-trigger", resourceId: context.propsValue.table_id, payload: { webhook_url: context.webhookUrl, event_type: "create" } });
    await context.store.put("passgrad_trigger_id", response.data.id);
  },

  async onDisable(context) {
    const triggerId = await context.store.get<string>("passgrad_trigger_id");
    if (triggerId) {
      await context.passgrad.request({ operation: "table.delete-trigger", resourceId: context.propsValue.table_id, payload: { triggerId } });
    }
  },

  async run(context) {
    return [context.payload.body ?? context.payload];
  },

  async test(context) {
    try {
      const response = await context.passgrad.request<{ records: unknown[] }>({ operation: "table.list-records", resourceId: context.propsValue.table_id });
      if (response.records.length > 0) return [response.records[0]];
    } catch {
      /* fall through */
    }
    return [sampleData];
  },
});
