import { createAction, Property } from "@activepieces/pieces-framework";
import { tableIdProperty, recordFieldsProperty, passgradRequest } from "../common";

export const updateRecord = createAction({
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
    const response = await passgradRequest<{ data: unknown }>(context, {
      operation: "table.update-record",
      payload: { recordId: record_id, values: fields },
      resourceId: table_id,
    });
    return response.data;
  },
});
