import { createAction, Property } from "@activepieces/pieces-framework";
import { tableIdProperty, passgradRequest } from "../common";

export const getRecord = createAction({
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
    const response = await passgradRequest<{ data: unknown }>(context, {
      operation: "table.get-record",
      payload: { recordId: record_id },
      resourceId: table_id,
    });
    return response.data;
  },
});
