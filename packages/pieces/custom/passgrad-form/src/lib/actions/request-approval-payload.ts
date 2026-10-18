export interface ApprovalRequestPayloadProps {
  title: string;
  description?: string;
  approver_type: string;
  approver_user_ids?: string;
  approver_group_ids?: string;
  minimum_approvals?: number;
  comment_enabled?: boolean;
  comment_required?: boolean;
  attachments_enabled?: boolean;
  attachments_required?: boolean;
  max_files?: number;
  priority?: string;
  due_in_hours?: number;
  on_rejection?: string;
}

export function buildApprovalRequestPayload({ props, eventId, resumeUrl }: { props: ApprovalRequestPayloadProps; eventId: string; resumeUrl: string }) {
  const approver = props.approver_type === "groups" ? { type: "groups" as const, groupIds: parseIdList(props.approver_group_ids) } : { type: "users" as const, userIds: parseIdList(props.approver_user_ids) };

  return {
    type: "workflow.approval.requested.v2" as const,
    eventId,
    definition: {
      title: props.title,
      description: props.description ?? "",
      approver,
      minimumApprovals: props.minimum_approvals ?? 1,
      rejectionPolicy: "any_rejection" as const,
      comment: {
        enabled: props.comment_enabled ?? true,
        required: props.comment_required ?? false,
      },
      attachment: {
        enabled: props.attachments_enabled ?? true,
        required: props.attachments_required ?? false,
        maxFiles: props.max_files ?? 1,
      },
      priority: props.priority ?? "normal",
      dueInHours: props.due_in_hours ?? null,
    },
    resumeUrl,
  };
}

/** What the flow does once the approval is rejected. */
export type RejectionMode = "end" | "continue";

/**
 * A step saved before this setting existed has no value and keeps going, so published flows do
 * not change behaviour. New steps default to ending the process.
 */
export function rejectionMode(value: unknown): RejectionMode {
  return value === "end" ? "end" : "continue";
}

/** Whether the approval's resume payload says the approvers rejected it. */
export function isRejectedResume(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const { resolution, decision } = body as { resolution?: unknown; decision?: unknown };
  return resolution === "rejected" || decision === "reject";
}

/** The business-resolution call that ends a process as rejected, for the step that was rejected. */
export function buildRejectedCompletion({ title, body, eventId }: { title: string; body: unknown; eventId: string }) {
  const taskId = typeof body === "object" && body !== null ? (body as { taskId?: unknown }).taskId : undefined;
  return {
    type: "workflow.process.completed.v1" as const,
    eventId,
    resolution: "rejected" as const,
    summary: `Rejected: ${title}`,
    data: typeof taskId === "string" ? { taskId } : {},
  };
}

function parseIdList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
