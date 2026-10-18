import { randomUUID } from "node:crypto";

import { createAction, Property } from "@activepieces/pieces-framework";
import { buildApprovalRequestPayload, buildRejectedCompletion, isRejectedResume, rejectionMode } from "./request-approval-payload";

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

/** Opens a Passgrad Approval task, pauses this run, then returns its aggregate decision on resume. */
export const requestApprovalV2 = createAction({
  name: "request_approval_v2",
  displayName: "Request Approval",
  description: "Pause the flow until assigned Passgrad approvers reach the minimum approvals or reject the source submission. A rejection ends the process unless the step is set to continue.",
  // Waits for a person. Not repeated, and not the builder's to set, so no switch.
  errorHandlingOptions: {
    continueOnFailure: { hide: true, defaultValue: false },
    retryOnFailure: { hide: true, defaultValue: false },
  },
  props: {
    title: Property.ShortText({ displayName: "Title", required: true }),
    description: Property.LongText({ displayName: "Description", required: false }),
    approver_type: Property.StaticDropdown({
      displayName: "Approver Type",
      required: true,
      defaultValue: "users",
      options: {
        disabled: false,
        options: [
          { label: "Users", value: "users" },
          { label: "Groups", value: "groups" },
        ],
      },
    }),
    approver_user_ids: Property.LongText({
      displayName: "Approver User IDs",
      description: "Comma-separated user IDs. Required when Approver Type is Users.",
      required: false,
    }),
    approver_group_ids: Property.LongText({
      displayName: "Approver Group IDs",
      description: "Comma-separated group IDs. Required when Approver Type is Groups.",
      required: false,
    }),
    minimum_approvals: Property.Number({
      displayName: "Minimum Approvals",
      required: false,
      defaultValue: 1,
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
    on_rejection: Property.StaticDropdown({
      displayName: "When Rejected",
      description: "End the process as rejected, or continue to the next step and branch on the result yourself.",
      required: false,
      defaultValue: "end",
      options: {
        disabled: false,
        options: [
          { label: "End the process as rejected", value: "end" },
          { label: "Continue to the next step", value: "continue" },
        ],
      },
    }),
    priority,
    due_in_hours: Property.Number({
      displayName: "Due In (Hours)",
      description: "Optional SLA measured from the source submission time.",
      required: false,
    }),
  },
  async run(context) {
    if ("resumePayload" in context && context.resumePayload) {
      const body = context.resumePayload.body;
      // An approval that was not obtained ends the process, so nothing after it runs on the
      // strength of an approval that does not exist. "Continue" leaves branching to the flow.
      if (rejectionMode(context.propsValue.on_rejection) === "end" && isRejectedResume(body)) {
        await context.passgrad.request({
          operation: "workflow.complete-process",
          payload: buildRejectedCompletion({ title: context.propsValue.title, body, eventId: randomUUID() }),
        });
        context.run.stop({ response: { status: 200, body: body as never } });
      }
      return body;
    }

    const waitpoint = await context.run.createWaitpoint({ type: "WEBHOOK", version: "V1" });
    await context.passgrad.request({
      operation: "workflow.open-approval-request",
      payload: buildApprovalRequestPayload({
        props: context.propsValue,
        eventId: randomUUID(),
        resumeUrl: waitpoint.buildResumeUrl({ queryParams: {} }),
      }),
    });

    context.run.waitForWaitpoint(waitpoint.id);
    return { status: "waiting" };
  },
});
