import { randomUUID } from "node:crypto";

import { createAction, Property } from "@activepieces/pieces-framework";

export const addInformation = createAction({
  name: "add_information",
  displayName: "Add Information",
  description: "Append an immutable information tab to the source submission.",
  props: {
    source_submission_id: Property.ShortText({
      displayName: "Source Submission ID",
      required: true,
    }),
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
        sourceSubmissionId: context.propsValue.source_submission_id,
        title: context.propsValue.title,
        description: context.propsValue.description ?? "",
        data: context.propsValue.data,
      },
    });
    return response.data;
  },
});
