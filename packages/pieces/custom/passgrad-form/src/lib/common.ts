import type { PassgradRequest, PropertyContext } from "@activepieces/pieces-framework";
import { Property } from "@activepieces/pieces-framework";

type PassgradContext = Pick<PropertyContext, "passgrad">;

type DropdownPropsValue = Record<string, unknown>;

interface DropdownFromListConfig<TItem> {
  displayName: string;
  description: string;
  refreshers: string[];
  /** Returns a placeholder when the dropdown must stay disabled before fetching. */
  guard?: (propsValue: DropdownPropsValue) => string | undefined;
  fetch: (propsValue: DropdownPropsValue, context: PassgradContext) => Promise<TItem[]>;
  mapOption: (item: TItem) => { label: string; value: string };
  emptyPlaceholder: string;
  errorPlaceholder: string;
}

function dropdownFromList<TItem>(config: DropdownFromListConfig<TItem>) {
  return Property.Dropdown<string, true>({
    auth: undefined,
    displayName: config.displayName,
    description: config.description,
    refreshers: config.refreshers,
    required: true,
    options: async (propsValue, context) => {
      const guardPlaceholder = config.guard?.(propsValue);
      if (guardPlaceholder !== undefined) {
        return { disabled: true, options: [], placeholder: guardPlaceholder };
      }
      try {
        const items = await config.fetch(propsValue, context);
        if (items.length === 0) {
          return { disabled: true, options: [], placeholder: config.emptyPlaceholder };
        }
        return { options: items.map(config.mapOption) };
      } catch {
        return { disabled: true, options: [], placeholder: config.errorPlaceholder };
      }
    },
  });
}

function listOperation<TItem>(operation: PassgradRequest["operation"]) {
  return async (_propsValue: DropdownPropsValue, context: PassgradContext) => {
    const response = await context.passgrad.request<{ data: TItem[] }>({ operation });
    return response.data ?? [];
  };
}

/** Shared form ID property resolved through the authenticated engine capability. */
export const formIdProperty = dropdownFromList<{ id: string; name: string }>({
  displayName: "Form",
  description: "The Passgrad form to use",
  refreshers: [],
  fetch: listOperation("form.list"),
  mapOption: (form) => ({ label: form.name, value: form.id }),
  emptyPlaceholder: "No forms available",
  errorPlaceholder: "Unable to load forms",
});

/** Shared member ID property resolved through the authenticated engine capability. */
export const userIdProperty = dropdownFromList<{
  email: string;
  name: string;
  userId: string;
}>({
  displayName: "User",
  description: "The Passgrad tenant member to use",
  refreshers: [],
  fetch: listOperation("user.list"),
  mapOption: (member) => ({
    label: `${member.name} (${member.email})`,
    value: member.userId,
  }),
  emptyPlaceholder: "No members available",
  errorPlaceholder: "Unable to load members",
});

/** Shared group ID property resolved through the authenticated engine capability. */
export const groupIdProperty = dropdownFromList<{ id: string; name: string }>({
  displayName: "Group",
  description: "The Passgrad group to use",
  refreshers: [],
  fetch: listOperation("group.list"),
  mapOption: (group) => ({ label: group.name, value: group.id }),
  emptyPlaceholder: "No groups available",
  errorPlaceholder: "Unable to load groups",
});

/** Shared workflow ID property resolved through the authenticated engine capability. */
export const workflowIdProperty = dropdownFromList<{ id: string; name: string }>({
  displayName: "Workflow",
  description: "The Passgrad workflow to use",
  refreshers: [],
  fetch: listOperation("workflow.list"),
  mapOption: (workflow) => ({ label: workflow.name, value: workflow.id }),
  emptyPlaceholder: "No workflows available",
  errorPlaceholder: "Unable to load workflows",
});

/** Form field ID property scoped to the selected KRS form. */
export const formFieldIdProperty = dropdownFromList<{ id: string; label: string }>({
  displayName: "Form field",
  description: "The Passgrad form field to use",
  refreshers: ["form_id"],
  guard: (propsValue) => {
    const formId = propsValue["form_id"];
    return typeof formId === "string" && formId.length > 0 ? undefined : "Select a KRS form first";
  },
  fetch: async (propsValue, context) => {
    const formId = propsValue["form_id"] as string;
    const response = await context.passgrad.request<{
      data: {
        id: string;
        draftDefinition?: { fields?: { id: string; label: string }[] };
      }[];
    }>({ operation: "form.list" });
    const form = (response.data ?? []).find((candidate) => candidate.id === formId);
    return form?.draftDefinition?.fields ?? [];
  },
  mapOption: (field) => ({ label: field.label, value: field.id }),
  emptyPlaceholder: "No form fields available",
  errorPlaceholder: "Unable to load form fields",
});

export function passgradRequest<T>(context: PassgradContext, request: PassgradRequest) {
  return context.passgrad.request<T>(request);
}
