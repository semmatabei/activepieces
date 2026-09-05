function parseIdList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Builds the frozen `workflow.action.requested.v1` callback payload. Both
 * `priority` and `dueAt` keys are always present: the Passgrad contract
 * validates fixed objects strictly and rejects omitted required keys.
 */
function buildActionRequestPayload(input: {
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

/** Public utility surface for request action payload construction. */
export const requestActionPayloadUtils = {
  buildActionRequestPayload,
};

/** Props shape accepted by the Request Action piece UI (runtime dropdown values are plain strings). */
export interface RequestActionProps {
  title: string;
  description?: string;
  assignee_type: string;
  assignee_user_ids?: string;
  assignee_group_ids?: string;
  fields: unknown;
  priority?: string;
  due_at?: string;
}
