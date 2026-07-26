import { createTrigger, TriggerStrategy } from "@activepieces/pieces-framework";
import { passgradAuth, tableIdProperty, passgradRequest } from "../common";
import { HttpMethod } from "@activepieces/pieces-common";

export const deletedRecord = createTrigger({
  auth: passgradAuth,
  name: "deleted_record",
  displayName: "Deleted Record",
  description: "Triggers when a record is deleted from the selected Passgrad table.",
  type: TriggerStrategy.APP_WEBHOOK,
  props: { table_id: tableIdProperty },
  sampleData: {
    record_id: "rec_abc123",
    table_id: "tb_mahasiswa",
    deleted_at: "2025-06-26T16:00:00Z",
    data: { f_mhs_nama: "Ahmad Fauzi", f_mhs_status: "tidak_aktif" },
  },

  async onEnable(context) {
    const response = await passgradRequest<{ data: { id: string } }>(
      context.auth,
      HttpMethod.POST,
      `/tables/${context.propsValue.table_id}/triggers`,
      { webhook_url: context.webhookUrl, event_type: "delete" },
    );
    await context.store.put("passgrad_trigger_id", response.body.data.id);
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
