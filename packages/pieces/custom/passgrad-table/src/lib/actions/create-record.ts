import { createAction } from "@activepieces/pieces-framework";
import { passgradAuth, tableIdProperty, recordFieldsProperty } from "../common";

export const createRecord = createAction({
  auth: passgradAuth,
  name: "create_record",
  displayName: "Create Record",
  description: "Insert a new record into the selected Passgrad table.",
  props: {
    table_id: tableIdProperty,
    fields: recordFieldsProperty,
  },
  async run(context) {
    const { table_id, fields } = context.propsValue;
    const response = await context.passgrad.request<{ record: unknown }>({
      operation: "table.create-record", resourceId: table_id, payload: { values: fields },
    });
    return response.record;
  },
});
