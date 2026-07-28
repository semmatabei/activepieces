import { createAction, Property } from "@activepieces/pieces-framework";
import { passgradAuth, tableIdProperty } from "../common";

export const getRecord = createAction({
  auth: passgradAuth,
  name: "get_record",
  displayName: "Get Record",
  description: "Retrieve a specific record from the selected Passgrad table.",
  props: {
    table_id: tableIdProperty,
    record_id: Property.ShortText({
      displayName: "Record ID",
      description: "ID of the record to retrieve",
      required: true,
    }),
  },
  async run(context) {
    const { table_id, record_id } = context.propsValue;
    const response = await context.passgrad.request<{ record: unknown }>({
      operation: "table.get-record", resourceId: table_id, payload: { recordId: record_id },
    });
    return response.record;
  },
});
