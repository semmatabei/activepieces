import { createHash } from "node:crypto";

import { createAction, Property } from "@activepieces/pieces-framework";

const resolvedOutput = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Persuratan resolution output is invalid");
  }
  const output = value as Record<string, unknown>;
  if (
    output.type !== "persuratan.case.resolved.v1" ||
    typeof output.eventId !== "string" ||
    typeof output.caseId !== "string" ||
    typeof output.sourceSubmissionId !== "string" ||
    output.status !== "closed" ||
    !["completed", "rejected", "cancelled"].includes(String(output.resolution)) ||
    typeof output.closedAt !== "string"
  ) {
    throw new Error("Persuratan resolution output is invalid");
  }
  return output;
};

/** Pauses the current run until the selected Persuratan case reaches a terminal resolution. */
export const waitForPersuratanCaseResolution = createAction({
  name: "wait_for_persuratan_case_resolution",
  displayName: "Wait for Persuratan Case Resolution",
  description: "Pause the flow until a Persuratan case is completed, rejected, or cancelled.",
  props: {
    case_id: Property.ShortText({ displayName: "Case ID", required: true }),
  },
  async run(context) {
    if ("resumePayload" in context && context.resumePayload) {
      return resolvedOutput(context.resumePayload.body);
    }

    const caseId = context.propsValue.case_id;
    if (typeof caseId !== "string" || caseId.trim() === "") {
      throw new Error("Case ID is required");
    }
    const waitpoint = await context.run.createWaitpoint({ type: "WEBHOOK", version: "V1" });
    const eventId = `persuratan-resolution:${createHash("sha256")
      .update(`${context.run.id}:${context.step.name}`)
      .digest("hex")}`;
    const response = await context.passgrad.request<{
      data: { status: "waiting"; waiterId: string } | { status: "resolved"; output: unknown };
    }>({
      operation: "workflow.wait-for-persuratan-case-resolution",
      payload: {
        type: "workflow.persuratan.case.resolution.wait.v1",
        eventId,
        caseId: caseId.trim(),
        resumeUrl: waitpoint.buildResumeUrl({ queryParams: {} }),
      },
    });
    if (response.data.status === "resolved") return resolvedOutput(response.data.output);
    if (response.data.status !== "waiting" || typeof response.data.waiterId !== "string") {
      throw new Error("Persuratan resolution wait registration is invalid");
    }
    context.run.waitForWaitpoint(waitpoint.id);
    return { status: "waiting" };
  },
});
