import { createAction, Property } from "@activepieces/pieces-framework";
import { formIdProperty, passgradAuth } from "../common";

const actorUserIdProperty = Property.ShortText({
  displayName: "Assigned user ID",
  description: "Passgrad user ID of the current tenant member who must submit this Form.",
  required: true,
});

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
  auth: passgradAuth,
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
    const response = await context.passgrad.request<OpenedSession>({
      operation: "form.open-workflow-session",
      payload: {
        actorUserId: context.propsValue.actor_user_id,
        formId: context.propsValue.form_id,
        resumeUrl: waitpoint.resumeUrl,
        workflowNodeReference: context.step.name,
        workflowReference: context.flows.current.id,
        workflowRunReference: context.run.id,
      },
    });

    context.run.waitForWaitpoint(waitpoint.id);
    return { sessionId: response.data.id, status: "waiting" };
  },
});
