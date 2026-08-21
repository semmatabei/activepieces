import { createAction } from "@activepieces/pieces-framework";
import { tableIdProperty, recordFieldsProperty, passgradRequest } from "../common";

export const createRecord = createAction({
  name: "create_record",
  displayName: "Create Record",
  description: "Insert a new record into the selected Passgrad table.",
  props: {
    table_id: tableIdProperty,
    fields: recordFieldsProperty,
  },
  async run(context) {
    const { table_id, fields } = context.propsValue;
    const response = await passgradRequest<{ data: unknown }>(context, {
      operation: "table.create-record",
      payload: { values: fields },
      resourceId: table_id,
    });
    return response.data;
  },
});
