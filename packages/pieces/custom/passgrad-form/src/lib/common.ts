import type { PassgradRequest, PropertyContext } from "@activepieces/pieces-framework";
import { Property } from "@activepieces/pieces-framework";

type PassgradContext = Pick<PropertyContext, "passgrad">;

/** Shared form ID property resolved through the authenticated engine capability. */
export const formIdProperty = Property.Dropdown<string, true>({
  auth: undefined,
  displayName: "Form",
  description: "The Passgrad form to use",
  refreshers: [],
  required: true,
  options: async (_propsValue, context) => {
    try {
      const response = await context.passgrad.request<{
        data: { id: string; name: string }[];
      }>({ operation: "form.list" });
      const forms = response.data ?? [];
      if (forms.length === 0) {
        return { disabled: true, options: [], placeholder: "No forms available" };
      }
      return {
        options: forms.map((form) => ({ label: form.name, value: form.id })),
      };
    } catch {
      return { disabled: true, options: [], placeholder: "Unable to load forms" };
    }
  },
});

/** Shared member ID property resolved through the authenticated engine capability. */
export const userIdProperty = Property.Dropdown<string, true>({
  auth: undefined,
  displayName: "User",
  description: "The Passgrad tenant member to use",
  refreshers: [],
  required: true,
  options: async (_propsValue, context) => {
    try {
      const response = await context.passgrad.request<{
        data: { email: string; name: string; userId: string }[];
      }>({ operation: "user.list" });
      const members = response.data ?? [];
      if (members.length === 0) {
        return { disabled: true, options: [], placeholder: "No members available" };
      }
      return {
        options: members.map((member) => ({
          label: `${member.name} (${member.email})`,
          value: member.userId,
        })),
      };
    } catch {
      return { disabled: true, options: [], placeholder: "Unable to load members" };
    }
  },
});

/** Shared group ID property resolved through the authenticated engine capability. */
export const groupIdProperty = Property.Dropdown<string, true>({
  auth: undefined,
  displayName: "Group",
  description: "The Passgrad group to use",
  refreshers: [],
  required: true,
  options: async (_propsValue, context) => {
    try {
      const response = await context.passgrad.request<{
        data: { id: string; name: string }[];
      }>({ operation: "group.list" });
      const groups = response.data ?? [];
      if (groups.length === 0) {
        return { disabled: true, options: [], placeholder: "No groups available" };
      }
      return {
        options: groups.map((group) => ({ label: group.name, value: group.id })),
      };
    } catch {
      return { disabled: true, options: [], placeholder: "Unable to load groups" };
    }
  },
});

/** Shared workflow ID property resolved through the authenticated engine capability. */
export const workflowIdProperty = Property.Dropdown<string, true>({
  auth: undefined,
  displayName: "Workflow",
  description: "The Passgrad workflow to use",
  refreshers: [],
  required: true,
  options: async (_propsValue, context) => {
    try {
      const response = await context.passgrad.request<{
        data: { id: string; name: string }[];
      }>({ operation: "workflow.list" });
      const workflows = response.data ?? [];
      if (workflows.length === 0) {
        return { disabled: true, options: [], placeholder: "No workflows available" };
      }
      return {
        options: workflows.map((workflow) => ({
          label: workflow.name,
          value: workflow.id,
        })),
      };
    } catch {
      return { disabled: true, options: [], placeholder: "Unable to load workflows" };
    }
  },
});

/** Form field ID property scoped to the selected KRS form. */
export const formFieldIdProperty = Property.Dropdown<string, true>({
  auth: undefined,
  displayName: "Form field",
  description: "The Passgrad form field to use",
  refreshers: ["form_id"],
  required: true,
  options: async (propsValue, context) => {
    const formId = propsValue["form_id"];
    if (typeof formId !== "string" || formId.length === 0) {
      return {
        disabled: true,
        options: [],
        placeholder: "Select a KRS form first",
      };
    }
    try {
      const response = await context.passgrad.request<{
        data: {
          id: string;
          draftDefinition?: { fields?: { id: string; label: string }[] };
        }[];
      }>({ operation: "form.list" });
      const form = (response.data ?? []).find((candidate) => candidate.id === formId);
      const fields = form?.draftDefinition?.fields ?? [];
      if (fields.length === 0) {
        return { disabled: true, options: [], placeholder: "No form fields available" };
      }
      return {
        options: fields.map((field) => ({ label: field.label, value: field.id })),
      };
    } catch {
      return { disabled: true, options: [], placeholder: "Unable to load form fields" };
    }
  },
});

export function passgradRequest<T>(context: PassgradContext, request: PassgradRequest) {
  return context.passgrad.request<T>(request);
}
