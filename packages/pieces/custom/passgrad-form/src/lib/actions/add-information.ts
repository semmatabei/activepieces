import { randomUUID } from "node:crypto";

import { createAction, Property } from "@activepieces/pieces-framework";

export const addInformation = createAction({
  name: "add_information",
  displayName: "Add Information",
  description: "Append an immutable information tab to the source submission.",
  // Safe to repeat (read-only, or replay-safe by occurrence): a transient failure is retried by the
  // engine, a permanent one (a refused request) is not. Not the builder's to set, so no switch.
  errorHandlingOptions: {
    continueOnFailure: { hide: true, defaultValue: false },
    retryOnFailure: { hide: true, defaultValue: true },
  },
  props: {
    title: Property.ShortText({ displayName: "Title", required: true }),
    description: Property.LongText({ displayName: "Description", required: false }),
    data: Property.Json({ displayName: "Data", required: true }),
  },
  async run(context) {
    const response = await context.passgrad.request<{ data: unknown }>({
      operation: "workflow.add-information",
      payload: {
        type: "workflow.submission-information.appended.v1",
        eventId: randomUUID(),
        title: context.propsValue.title,
        description: context.propsValue.description ?? "",
        data: context.propsValue.data,
      },
    });
    return response.data;
  },
});
