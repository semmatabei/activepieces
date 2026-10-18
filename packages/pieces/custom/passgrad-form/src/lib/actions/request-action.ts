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

/** What a skipped task does to the process; offered only when the assignee may skip. */
function onSkipProperty() {
  return Property.StaticDropdown({
    displayName: "When Not Completed",
    description: "End the process as not completed, or continue to the next step and branch on the result yourself.",
    required: false,
    defaultValue: "end",
    options: {
      disabled: false,
      options: [
        { label: "End the process as not completed", value: "end" },
        { label: "Continue to the next step", value: "continue" },
      ],
    },
  });
}

/** Opens a Passgrad Action task, pauses this run, then returns its captured response on resume. */
export const requestAction = createAction({
  name: "request_action",
  displayName: "Request Action",
  description: "Pause the flow until the assigned Passgrad member completes an Action task on the source submission.",
  // Waits for a person. Not repeated, and not the builder's to set, so no switch.
  errorHandlingOptions: {
    continueOnFailure: { hide: true, defaultValue: false },
    retryOnFailure: { hide: true, defaultValue: false },
  },
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
    comment_enabled: Property.Checkbox({
      displayName: "Enable Comments",
      required: false,
      defaultValue: true,
    }),
    comment_required: Property.Checkbox({
      displayName: "Require Comments",
      required: false,
      defaultValue: false,
    }),
    attachments_enabled: Property.Checkbox({
      displayName: "Enable Attachments",
      required: false,
      defaultValue: true,
    }),
    attachments_required: Property.Checkbox({
      displayName: "Require Attachments",
      required: false,
      defaultValue: false,
    }),
    max_files: Property.Number({
      displayName: "Max Attachment Files",
      required: false,
      defaultValue: 1,
    }),
    allow_skip: Property.Checkbox({
      displayName: "Assignee Can Skip",
      description: "Adds a second button to the task so the assignee can say it could not be completed. A reason is required.",
      required: false,
      defaultValue: false,
    }),
    skip_options: Property.DynamicProperties({
      auth: undefined,
      displayName: "When Not Completed",
      refreshers: ["allow_skip"],
      required: false,
      props: async ({ allow_skip }) => {
        const options: Record<string, ReturnType<typeof onSkipProperty>> = {};
        if (allow_skip) options["on_skip"] = onSkipProperty();
        return options;
      },
    }),
    priority,
    due_in_hours: Property.Number({
      displayName: "Due In (Hours)",
      description: "Optional SLA measured from the source submission time.",
      required: false,
    }),
    // Kept so flows saved before the simple setup keep working; the builder no longer shows them.
    fields: Property.Json({
      displayName: "Fields",
      description: "Legacy: array of field definitions. Used only when set; otherwise Comments and Attachments apply.",
      required: false,
    }),
    due_at: Property.DateTime({
      displayName: "Due At",
      description: "Legacy: fixed ISO 8601 due date. Prefer Due In (Hours).",
      required: false,
    }),
  },
  async run(context) {
    if ("resumePayload" in context && context.resumePayload) {
      const body = context.resumePayload.body;
      // A task its assignee could not complete ends the process unless the step says to carry on.
      const skipOptions = context.propsValue.skip_options as { on_skip?: unknown } | undefined;
      if (requestActionPayloadUtils.isSkippedResume(body) && requestActionPayloadUtils.skipMode(skipOptions?.on_skip) === "end") {
        await context.passgrad.request({
          operation: "workflow.complete-process",
          payload: requestActionPayloadUtils.buildSkippedCompletion({ title: context.propsValue.title, body, eventId: randomUUID() }),
        });
        context.run.stop({ response: { status: 200, body: body as never } });
      }
      return body;
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
