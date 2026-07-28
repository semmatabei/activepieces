import { createAction, Property } from "@activepieces/pieces-framework";
import { passgradAuth, tableIdProperty, recordFieldsProperty } from "../common";

export const updateRecord = createAction({
  auth: passgradAuth,
  name: "update_record",
  displayName: "Update Record",
  description: "Update an existing record in the selected Passgrad table.",
  props: {
    table_id: tableIdProperty,
    record_id: Property.ShortText({
      displayName: "Record ID",
      description: "ID of the record to update",
      required: true,
    }),
    fields: recordFieldsProperty,
  },
  async run(context) {
    const { table_id, record_id, fields } = context.propsValue;
    const response = await context.passgrad.request<{ record: unknown }>({
      operation: "table.update-record", resourceId: table_id, payload: { recordId: record_id, values: fields },
    });
    return response.record;
  },
});
