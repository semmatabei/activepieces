function parseIdList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export interface RequestActionProps {
  source_submission_id: string;
  title: string;
  description?: string;
  /** Runtime dropdown values are plain strings; narrowed inside the builder. */
  assignee_type: string;
  assignee_user_ids?: string;
  assignee_group_ids?: string;
  fields: unknown;
  priority?: string;
  due_at?: string;
}

/**
 * Builds the frozen `workflow.action.requested.v1` callback payload. Both
 * `priority` and `dueAt` keys are always present: the Passgrad contract
 * validates fixed objects strictly and rejects omitted required keys.
 */
export function buildActionRequestPayload(input: {
  props: RequestActionProps;
  eventId: string;
  resumeUrl: string;
}) {
  const assigneeType = input.props.assignee_type;
  const assignee =
    assigneeType === "users"
      ? { type: "users", userIds: parseIdList(input.props.assignee_user_ids) }
      : assigneeType === "groups"
        ? { type: "groups", groupIds: parseIdList(input.props.assignee_group_ids) }
        : { type: "source_submitter" };
  return {
    type: "workflow.action.requested.v1",
    eventId: input.eventId,
    sourceSubmissionId: input.props.source_submission_id,
    definition: {
      title: input.props.title,
      description: input.props.description ?? "",
      assignee,
      policy: "any",
      fields: input.props.fields,
    },
    priority: input.props.priority ?? "normal",
    dueAt: input.props.due_at ?? null,
    resumeUrl: input.resumeUrl,
  };
}
