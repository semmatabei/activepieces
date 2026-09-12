import { randomUUID } from "node:crypto";

import { createAction, Property } from "@activepieces/pieces-framework";

import { requestActionPayloadUtils } from "./request-action-payload";

const priority = Property.StaticDropdown({
  displayName: "Priority",
  required: false,
  options: {
    disabled: false,
    options: [
      { label: "Low", value: "low" },
      { label: "Normal", value: "normal" },
      { label: "High", value: "high" },
    ],
  },
});

/** Opens a Passgrad Action task, pauses this run, then returns its captured response on resume. */
export const requestAction = createAction({
  name: "request_action",
  displayName: "Request Action",
  description: "Pause the flow until the assigned Passgrad member completes an Action task on the source submission.",
  props: {
    title: Property.ShortText({ displayName: "Title", required: true }),
    description: Property.LongText({ displayName: "Description", required: false }),
    assignee_type: Property.StaticDropdown({
      displayName: "Assignee Type",
      required: true,
      defaultValue: "source_submitter",
      options: {
        disabled: false,
        options: [
          { label: "Source submitter", value: "source_submitter" },
          { label: "Users", value: "users" },
          { label: "Groups", value: "groups" },
        ],
      },
    }),
    assignee_user_ids: Property.LongText({
      displayName: "Assignee User IDs",
      description: "Comma-separated user IDs. Required when Assignee Type is Users.",
      required: false,
    }),
    assignee_group_ids: Property.LongText({
      displayName: "Assignee Group IDs",
      description: "Comma-separated group IDs. Required when Assignee Type is Groups.",
      required: false,
    }),
    fields: Property.Json({
      displayName: "Fields",
      description: "Array of field definitions (1-100) rendered on the Action task.",
      required: true,
    }),
    priority,
    due_at: Property.DateTime({
      displayName: "Due At",
      description: "Optional ISO 8601 due date for the Action task.",
      required: false,
    }),
  },
  async run(context) {
    if ("resumePayload" in context && context.resumePayload) {
      return context.resumePayload.body;
    }

    const waitpoint = await context.run.createWaitpoint({ type: "WEBHOOK", version: "V1" });

    await context.passgrad.request({
      operation: "workflow.open-action-request",
      payload: requestActionPayloadUtils.buildActionRequestPayload({
        props: context.propsValue,
        eventId: randomUUID(),
        resumeUrl: waitpoint.buildResumeUrl({ queryParams: {} }),
      }),
    });

    context.run.waitForWaitpoint(waitpoint.id);
    return { status: "waiting" };
  },
});
