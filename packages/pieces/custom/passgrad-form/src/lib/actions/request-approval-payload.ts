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

function parseIdList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
