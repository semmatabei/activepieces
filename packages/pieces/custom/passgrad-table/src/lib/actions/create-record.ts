import { createAction } from "@activepieces/pieces-framework";
import { tableIdProperty, recordFieldsProperty, passgradRequest } from "../common";

export const createRecord = createAction({
  name: "create_record",
  displayName: "Create Record",
  description: "Insert a new record into the selected Passgrad table. Replay-safe within workflow runs: retrying the same occurrence with the same fields returns the original record instead of creating a duplicate.",
  // Safe to repeat (read-only, or replay-safe by occurrence): a transient failure is retried by the
  // engine, a permanent one (a refused request) is not. Not the builder's to set, so no switch.
  errorHandlingOptions: {
    continueOnFailure: { hide: true, defaultValue: false },
    retryOnFailure: { hide: true, defaultValue: true },
  },
  props: {
    table_id: tableIdProperty,
    fields: recordFieldsProperty,
  },
  async run(context) {
    const { table_id, fields } = context.propsValue;
    const response = await passgradRequest<{ data: unknown }>(context, {
      operation: "table.create-workflow-record",
      payload: { values: fields },
      resourceId: table_id,
    });
    return response.data;
  },
});
