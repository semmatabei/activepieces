import { createAction } from "@activepieces/pieces-framework";

import { formIdProperty, passgradRequest, userIdProperty } from "../common";

const actorUserIdProperty = {
  ...userIdProperty,
  displayName: "Assigned user",
  description: "Pick a tenant member or paste a user ID from a previous step.",
};

interface OpenedSession {
  data: { id: string };
}

interface ResumePayload {
  data: Record<string, unknown>;
  sessionId: string;
  submissionId: string;
}

/** Opens a pinned Form session, pauses this run, then returns its captured data on resume. */
export const requestSubmission = createAction({
  name: "request_submission",
  displayName: "Request submission",
  description: "Pause the flow until an assigned Passgrad member submits a published Form.",
  props: {
    form_id: formIdProperty,
    actor_user_id: actorUserIdProperty,
  },
  async run(context) {
    if ("resumePayload" in context && context.resumePayload) {
      return context.resumePayload.body as ResumePayload;
    }

    const waitpoint = await context.run.createWaitpoint({ type: "WEBHOOK", version: "V1" });
    const response = await passgradRequest<OpenedSession>(context, {
      operation: "form.open-workflow-session",
      payload: {
        actorUserId: context.propsValue.actor_user_id,
        formId: context.propsValue.form_id,
        resumeUrl: waitpoint.buildResumeUrl({ queryParams: {} }),
        workflowNodeReference: context.step.name,
        workflowReference: context.flows.current.id,
        workflowRunReference: context.run.id,
      },
    });

    context.run.waitForWaitpoint(waitpoint.id);
    return { sessionId: response.data.id, status: "waiting" };
  },
});
