import { createAction } from "@activepieces/pieces-framework";
import { passgradAuth, tableIdProperty, recordFieldsProperty, passgradRequest } from "../common";
import { HttpMethod } from "@activepieces/pieces-common";

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
    const response = await passgradRequest<{ record: unknown }>(
      context.auth,
      HttpMethod.POST,
      `/tables/${table_id}/records`,
      { values: fields },
    );
    return response.body.record;
  },
});
