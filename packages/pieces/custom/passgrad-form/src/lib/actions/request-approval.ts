import { createAction, Property } from "@activepieces/pieces-framework";
import { randomUUID } from "node:crypto";

import { passgradAuth } from "../common";

const title = Property.ShortText({ displayName: "Title", required: true });
const description = Property.LongText({ displayName: "Description", required: false });
const assigneeUserId = Property.ShortText({
  displayName: "Assigned user ID",
  description: "Passgrad tenant member who may approve or reject this request.",
  required: true,
});
const workflowId = Property.ShortText({
  displayName: "Passgrad workflow ID",
  description: "Workflow record that owns this Activepieces Flow.",
  required: true,
});
const triggerKind = Property.StaticDropdown({
  displayName: "Trigger kind",
  description: "Passgrad trigger category that started this approval run.",
  required: true,
  defaultValue: "schedule",
  options: {
    disabled: false,
    options: [
      { label: "Form submission", value: "form_submission" },
      { label: "Record created", value: "record_created" },
      { label: "Record updated", value: "record_updated" },
      { label: "Record deleted", value: "record_deleted" },
      { label: "Schedule", value: "schedule" },
      { label: "Webhook", value: "webhook" },
      { label: "Manual", value: "manual" },
    ],
  },
});

type ResumePayload = { comment: string; decision: "approve" | "reject"; taskId: string };

/** Creates one approval Task, pauses this run, then returns its first durable decision. */
export const requestApproval = createAction({
  auth: passgradAuth,
  name: "request_approval",
  displayName: "Request approval",
  description: "Pause flow until assigned Passgrad member approves or rejects.",
  props: {
    assignee_user_id: assigneeUserId,
    description,
    title,
    trigger_kind: triggerKind,
    workflow_id: workflowId,
  },
  async run(context) {
    if ("resumePayload" in context && context.resumePayload) {
      return context.resumePayload.body as ResumePayload;
    }

    const waitpoint = await context.run.createWaitpoint({ type: "WEBHOOK", version: "V1" });
    const occurrenceKey = `approval:${context.run.id}:${context.step.name}`;
    const existing = await context.store.get<{ apTaskId: string; eventId: string }>(occurrenceKey);
    const occurrence = existing ?? { apTaskId: randomUUID(), eventId: randomUUID() };
    if (!existing) await context.store.put(occurrenceKey, occurrence);
    try {
      await context.passgrad.request({
        operation: "form.project-workflow-run",
        payload: {
          apEventSequence: 0,
          apRunId: context.run.id,
          eventId: `${context.run.id}:waiting`,
          finishedAt: null,
          safeFailureSummary: null,
          sourceSubmissionId: null,
          startedAt: new Date().toISOString(),
          status: "waiting",
          triggerKind: context.propsValue.trigger_kind,
          type: "workflow.run.projection.v1",
          workflowId: context.propsValue.workflow_id,
        },
      });
    } catch {
      throw new Error("Passgrad waiting-run projection failed");
    }
    try {
      await context.passgrad.request({
        operation: "task.open-workflow-approval",
        payload: {
          apRunId: context.run.id,
          apStepId: context.step.name,
          apTaskId: occurrence.apTaskId,
          eventId: occurrence.eventId,
          type: "workflow.task.created.v1",
          workflowId: context.propsValue.workflow_id,
          task: {
            type: "approval",
            title: context.propsValue.title,
            description: context.propsValue.description ?? "",
            priority: "normal",
            dueAt: null,
            targets: [{ type: "user", userId: context.propsValue.assignee_user_id }],
            resumeUrl: waitpoint.buildResumeUrl({ queryParams: {} }),
          },
        },
      });
    } catch {
      throw new Error("Passgrad approval Task creation failed");
    }
    context.run.waitForWaitpoint(waitpoint.id);
    return { status: "waiting" };
  },
});
