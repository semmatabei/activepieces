import { createAction, Property } from "@activepieces/pieces-framework";
import { passgradRequest, tableIdProperty } from "../common";

export const getRecordsByIds = createAction({
  name: "get_records_by_ids",
  displayName: "Get Records by IDs",
  description: "Retrieve an ordered snapshot of up to 100 records from one Passgrad table.",
  props: {
    table_id: tableIdProperty,
    record_ids: Property.Json({
      displayName: "Record IDs",
      description: "Array of unique Passgrad record IDs. Missing records fail the action.",
      required: true,
    }),
  },
  async run(context) {
    const { table_id, record_ids } = context.propsValue;
    const response = await passgradRequest<{ data: { records: unknown[] } }>(context, {
      operation: "table.get-records-by-ids",
      payload: { missingRecordPolicy: "fail", recordIds: record_ids },
      resourceId: table_id,
    });
    return response.data;
  },
});
