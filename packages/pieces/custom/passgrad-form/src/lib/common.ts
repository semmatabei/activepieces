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

export const moderatorTargetProperty = dropdownFromList<{ id: string; label: string }>({
  displayName: "Moderator target",
  description: "User, group, or submitted Person field used as moderator",
  refreshers: ["moderator_type", "source_form_id"],
  guard: (propsValue) => {
    const moderatorType = propsValue["moderator_type"];
    if (
      moderatorType !== "fixed_user" &&
      moderatorType !== "fixed_group" &&
      moderatorType !== "submission_person_field"
    ) {
      return "Select a moderator mode first";
    }
    if (
      moderatorType === "submission_person_field" &&
      (typeof propsValue["source_form_id"] !== "string" || !propsValue["source_form_id"])
    ) {
      return "Select a source Form first";
    }
    return undefined;
  },
  fetch: async (propsValue, context) => {
    if (propsValue["moderator_type"] === "fixed_user") {
      const response = await context.passgrad.request<{
        data: { email: string; name: string; userId: string }[];
      }>({ operation: "user.list" });
      return (response.data ?? []).map((member) => ({
        id: member.userId,
        label: `${member.name} (${member.email})`,
      }));
    }
    if (propsValue["moderator_type"] === "fixed_group") {
      const response = await context.passgrad.request<{ data: { id: string; name: string }[] }>({
        operation: "group.list",
      });
      return (response.data ?? []).map((group) => ({ id: group.id, label: group.name }));
    }
    const response = await context.passgrad.request<{
      data: {
        id: string;
        draftDefinition?: {
          fields?: {
            id: string;
            label: string;
            type?: string;
            visible?: boolean;
            config?: { multiple?: boolean };
          }[];
        };
      }[];
    }>({ operation: "form.list" });
    const sourceFormId = propsValue["source_form_id"] as string;
    const fields =
      response.data?.find((form) => form.id === sourceFormId)?.draftDefinition?.fields ?? [];
    return fields
      .filter(
        (field) =>
          field.visible !== false && field.type === "person" && field.config?.multiple !== true,
      )
      .map((field) => ({ id: field.id, label: field.label }));
  },
  mapOption: (target) => ({ label: target.label, value: target.id }),
  emptyPlaceholder: "No compatible moderator targets available",
  errorPlaceholder: "Unable to load moderator targets",
});

export function formFieldProperty(
  displayName: string,
  compatibleTypes?: readonly string[],
  options: {
    requireSingle?: boolean;
    refreshers?: string[];
    excludeKeys?: string[];
    propertyKey?: string;
    compatible?: (field: { type?: string }, propsValue: DropdownPropsValue) => boolean;
  } = {},
) {
  return dropdownFromList<{
    id: string;
    label: string;
    type?: string;
    visible?: boolean;
    config?: { multiple?: boolean };
  }>({
    displayName,
    description: "Field from selected Passgrad form",
    refreshers: ["source_form_id", ...(options.refreshers ?? []), ...(options.excludeKeys ?? [])],
    guard: (propsValue) =>
      typeof propsValue["source_form_id"] === "string" && propsValue["source_form_id"]
        ? undefined
        : "Select a source Form first",
    fetch: async (propsValue, context) => {
      const sourceFormId = propsValue["source_form_id"] as string;
      const response = await context.passgrad.request<{
        data: {
          id: string;
          draftDefinition?: {
            fields?: {
              id: string;
              label: string;
              type?: string;
              visible?: boolean;
              config?: { multiple?: boolean };
            }[];
          };
        }[];
      }>({ operation: "form.list" });
      const fields =
        response.data?.find((form) => form.id === sourceFormId)?.draftDefinition?.fields ?? [];
      const selectedIds = new Set(
        (options.excludeKeys ?? [])
          .filter((key) => key !== options.propertyKey)
          .map((key) => propsValue[key])
          .filter((value): value is string => typeof value === "string"),
      );
      return fields.filter(
        (field) =>
          field.visible !== false &&
          !selectedIds.has(field.id) &&
          (!compatibleTypes || compatibleTypes.includes(field.type ?? "")) &&
          (!options.requireSingle || field.config?.multiple !== true) &&
          (!options.compatible || options.compatible(field, propsValue)),
      );
    },
    mapOption: (field) => ({ label: field.label, value: field.id }),
    emptyPlaceholder: "No compatible form fields available",
    errorPlaceholder: "Unable to load form fields",
  });
}

export function passgradRequest<T>(context: PassgradContext, request: PassgradRequest) {
  return context.passgrad.request<T>(request);
}
