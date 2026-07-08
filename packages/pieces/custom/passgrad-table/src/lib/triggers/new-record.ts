import { createTrigger, TriggerStrategy } from "@activepieces/pieces-framework";
import { passgradAuth, tableIdProperty, passgradRequest } from "../common";
import { HttpMethod } from "@activepieces/pieces-common";

/**
 * Trigger: New Record — fires when a record is created in the selected table.
 * Uses APP_WEBHOOK: onEnable registers webhook with Passgrad, onDisable removes it.
 */
export const newRecord = createTrigger({
  auth: passgradAuth,
  name: "new_record",
  displayName: "New Record",
  description: "Triggers when a new record is created in the selected Passgrad table.",
  type: TriggerStrategy.APP_WEBHOOK,
  props: { table_id: tableIdProperty },
  sampleData: {
    record_id: "rec_abc123",
    table_id: "tb_mahasiswa",
    created_at: "2025-06-26T12:00:00Z",
    data: { f_mhs_nama: "Ahmad Fauzi", f_mhs_status: "aktif" },
  },

  async onEnable(context) {
    const response = await passgradRequest<{ trigger: { id: string } }>(
      context.auth,
      HttpMethod.POST,
      `/tables/${context.propsValue.table_id}/triggers`,
      { webhook_url: context.webhookUrl, event_type: "create" },
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

  async test(context) {
    try {
      const response = await passgradRequest<{ records: unknown[] }>(
        context.auth,
        HttpMethod.GET,
        `/tables/${context.propsValue.table_id}/records?limit=1&sort=-created_at`,
      );
      if (response.body.records.length > 0) return [response.body.records[0]];
    } catch {
      /* fall through */
    }
    return [context.trigger.sampleData];
  },
});
