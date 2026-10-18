function parseIdList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Fixed field ids for the two simple answers an Action task can ask for. A task's fields are
 * scoped to the task, so the same ids are reused for every task.
 */
const COMMENT_FIELD_ID = "01m4pnhkbeecwtv0ctgef661jn";
const ATTACHMENTS_FIELD_ID = "01m4pnhkbeecwtv0d6w8ynwyda";

/** The fields an Action task shows, from the simple Comments / Attachments setup. */
function buildSimpleActionFields(props: RequestActionProps) {
  const fields: Array<Record<string, unknown>> = [];
  if (props.comment_enabled ?? true) {
    fields.push({
      id: COMMENT_FIELD_ID,
      type: "textarea",
      label: "Comment",
      required: props.comment_required === true,
      position: fields.length,
      visible: true,
      config: {},
    });
  }
  if (props.attachments_enabled ?? true) {
    const maxFiles = props.max_files ?? 1;
    fields.push({
      id: ATTACHMENTS_FIELD_ID,
      type: "attachment",
      label: "Attachments",
      ...(maxFiles > 1 ? { description: `Up to ${maxFiles} files` } : {}),
      required: props.attachments_required === true,
      position: fields.length,
      visible: true,
      config: { multiple: maxFiles > 1 },
    });
  }
  if (fields.length === 0) {
    // An Action task needs something to complete; with both switched off it is a plain optional note.
    fields.push({ id: COMMENT_FIELD_ID, type: "textarea", label: "Note", required: false, position: 0, visible: true, config: {} });
  }
  return fields;
}

function hasLegacyFields(fields: unknown): fields is unknown[] {
  return Array.isArray(fields) && fields.length > 0;
}

/**
 * Builds the frozen `workflow.action.requested.v1` callback payload. Both
 * `priority` and `dueAt` keys are always present: the Passgrad contract
 * validates fixed objects strictly and rejects omitted required keys.
 */
function buildActionRequestPayload(input: { props: RequestActionProps; eventId: string; resumeUrl: string }) {
  const assigneeType = input.props.assignee_type;
  const assignee =
    assigneeType === "users" ? { type: "users", userIds: parseIdList(input.props.assignee_user_ids) } : assigneeType === "groups" ? { type: "groups", groupIds: parseIdList(input.props.assignee_group_ids) } : { type: "source_submitter" };
  return {
    type: "workflow.action.requested.v1",
    eventId: input.eventId,
    definition: {
      title: input.props.title,
      description: input.props.description ?? "",
      assignee,
      policy: "any",
      fields: hasLegacyFields(input.props.fields) ? input.props.fields : buildSimpleActionFields(input.props),
    },
    priority: input.props.priority ?? "normal",
    dueAt: input.props.due_at ?? null,
    // Only present when set, so tasks that do not use it keep their original callback shape.
    ...(input.props.due_in_hours ? { dueInHours: input.props.due_in_hours } : {}),
    ...(input.props.allow_skip === true ? { allowSkip: true } : {}),
    resumeUrl: input.resumeUrl,
  };
}

export type SkipMode = "end" | "continue";

/** What a skipped task does to the process: ends it unless the step says to carry on. */
function skipMode(value: unknown): SkipMode {
  return value === "continue" ? "continue" : "end";
}

/** Whether the task's resume payload says the assignee could not complete it. */
function isSkippedResume(body: unknown): boolean {
  return typeof body === "object" && body !== null && (body as { resolution?: unknown }).resolution === "skipped";
}

/**
 * The business-resolution call that ends a process because an Action task was not completed. The
 * process finishes, with its own outcome ("not carried out"), and the task and the reason in the
 * summary.
 */
function buildSkippedCompletion(input: { title: string; body: unknown; eventId: string }) {
  const body = typeof input.body === "object" && input.body !== null ? (input.body as { taskId?: unknown; reason?: unknown }) : {};
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  return {
    type: "workflow.process.completed.v1" as const,
    eventId: input.eventId,
    resolution: "not_completed" as const,
    summary: reason ? `Not completed: ${input.title} - ${reason}` : `Not completed: ${input.title}`,
    data: typeof body.taskId === "string" ? { taskId: body.taskId } : {},
  };
}

/** Public utility surface for request action payload construction. */
export const requestActionPayloadUtils = {
  buildActionRequestPayload,
  buildSkippedCompletion,
  isSkippedResume,
  skipMode,
};

/** Props shape accepted by the Request Action piece UI (runtime dropdown values are plain strings). */
export interface RequestActionProps {
  title: string;
  description?: string;
  assignee_type: string;
  assignee_user_ids?: string;
  assignee_group_ids?: string;
  comment_enabled?: boolean;
  comment_required?: boolean;
  attachments_enabled?: boolean;
  attachments_required?: boolean;
  max_files?: number;
  /** Legacy: explicit field definitions from flows saved before the simple setup. */
  fields?: unknown;
  priority?: string;
  due_in_hours?: number;
  /** The assignee may say the task could not be done, with a reason. */
  allow_skip?: boolean;
  /** Legacy fixed due date. */
  due_at?: string;
}
