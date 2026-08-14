import { randomUUID } from "node:crypto";

import { createAction, Property } from "@activepieces/pieces-framework";

import { passgradAuth } from "../common";

const title = Property.ShortText({ displayName: "Title", required: true });
const description = Property.LongText({ displayName: "Description", required: false });
const groupId = Property.ShortText({
  displayName: "Approver group ID",
  description: "Passgrad group responsible for this approval.",
  required: true,
});
const workflowId = Property.ShortText({
  displayName: "Passgrad workflow ID",
  description: "Workflow record that owns this Activepieces Flow.",
  required: true,
});
const formId = Property.ShortText({ displayName: "KRS form ID", required: false });
const submissionId = Property.ShortText({ displayName: "KRS submission ID", required: false });
const classFieldId = Property.ShortText({ displayName: "KRS class field ID", required: false });
const nilaiTableId = Property.ShortText({ displayName: "Nilai table ID", required: false });
const nilaiClassFieldId = Property.ShortText({ displayName: "Nilai class field ID", required: false });
const nilaiStatusFieldId = Property.ShortText({ displayName: "Nilai status field ID", required: false });
const nilaiStatusOptionId = Property.ShortText({ displayName: "Nilai status option ID", required: false });
const classCount = Property.ShortText({
  displayName: "Class count",
  description: "Optional calculated class count persisted with this workflow run.",
  required: false,
});
const totalFee = Property.ShortText({
  displayName: "Total fee",
  description: "Optional calculated KRS fee persisted with this workflow run.",
  required: false,
});
const triggerKind = Property.StaticDropdown({
  displayName: "Trigger kind",
  description: "Passgrad trigger category that started this approval run.",
  required: true,
  defaultValue: "form_submission",
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

/** Creates one group approval task, pauses this run, then returns its first durable decision. */
export const requestApproval = createAction({
  auth: passgradAuth,
  name: "request_approval",
  displayName: "Request group approval",
  description: "Pause flow until a member of the assigned Passgrad group approves or rejects.",
  props: {
    group_id: groupId,
    class_field_id: classFieldId,
    form_id: formId,
    class_count: classCount,
    nilai_class_field_id: nilaiClassFieldId,
    nilai_status_field_id: nilaiStatusFieldId,
    nilai_status_option_id: nilaiStatusOptionId,
    nilai_table_id: nilaiTableId,
    description,
    title,
    submission_id: submissionId,
    total_fee: totalFee,
    trigger_kind: triggerKind,
    workflow_id: workflowId,
  },
  async run(context) {
    const occurrenceKey = `approval:${context.run.id}:${context.step.name}`;
    const existing = await context.store.get<{ apTaskId: string; eventId: string }>(occurrenceKey);
    if ("resumePayload" in context && context.resumePayload) {
      const decision = context.resumePayload.body as ResumePayload;
      if (decision.decision === "approve") await appendNilaiRows(context);
      return decision;
    }

    const waitpoint = await context.run.createWaitpoint({ type: "WEBHOOK", version: "V1" });
    const occurrence = existing ?? { apTaskId: randomUUID(), eventId: randomUUID() };
    if (!existing) await context.store.put(occurrenceKey, occurrence);

    const result = await calculateKrsResult(context);
    try {
      await context.passgrad.request({
        operation: "form.project-workflow-run",
        payload: {
          apEventSequence: 0,
          apRunId: context.run.id,
          eventId: `${context.run.id}:waiting`,
          finishedAt: null,
          safeFailureSummary: null,
          result,
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
            targets: [{ type: "group", groupId: context.propsValue.group_id }],
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

async function calculateKrsResult(context: Parameters<typeof requestApproval.run>[0]) {
  const classCount = Number(context.propsValue.class_count);
  const totalFee = Number(context.propsValue.total_fee);
  if (Number.isInteger(classCount) && classCount >= 0 && Number.isFinite(totalFee)) {
    return { classCount, currency: "IDR", feePerClass: 250_000, totalFee };
  }
  const formId = context.propsValue.form_id?.trim();
  const submissionId = context.propsValue.submission_id?.trim();
  const classFieldId = context.propsValue.class_field_id?.trim();
  if (!formId || !submissionId || !classFieldId) return null;
  const response = await context.passgrad.request<{ data: { data: Record<string, unknown> } }>({
    operation: "form.get-submission",
    payload: { submissionId },
    resourceId: formId,
  });
  const classes = response.data.data[classFieldId];
  const selectedClassCount = Array.isArray(classes) ? classes.length : 0;
  return {
    classCount: selectedClassCount,
    currency: "IDR",
    feePerClass: 250_000,
    totalFee: selectedClassCount * 250_000,
  };
}

async function appendNilaiRows(context: Parameters<typeof requestApproval.run>[0]) {
  const tableId = context.propsValue.nilai_table_id?.trim();
  const classFieldId = context.propsValue.nilai_class_field_id?.trim();
  const statusFieldId = context.propsValue.nilai_status_field_id?.trim();
  const statusOptionId = context.propsValue.nilai_status_option_id?.trim();
  const formId = context.propsValue.form_id?.trim();
  const submissionId = context.propsValue.submission_id?.trim();
  const sourceFieldId = context.propsValue.class_field_id?.trim();
  if (!tableId || !classFieldId || !statusFieldId || !statusOptionId || !formId || !submissionId || !sourceFieldId)
    return;
  const response = await context.passgrad.request<{ data: { data: Record<string, unknown> } }>({
    operation: "form.get-submission",
    payload: { submissionId },
    resourceId: formId,
  });
  const classes = response.data.data[sourceFieldId];
  if (!Array.isArray(classes)) return;
  for (const selected of classes) {
    if (!selected || typeof selected !== "object" || !("labelSnapshot" in selected)) continue;
    await context.passgrad.request({
      operation: "table.create-record",
      payload: {
        values: {
          [classFieldId]: selected.labelSnapshot,
          [statusFieldId]: statusOptionId,
        },
      },
      resourceId: tableId,
    });
  }
}
