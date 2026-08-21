import type { PassgradRequest, PropertyContext } from "@activepieces/pieces-framework";
import { Property } from "@activepieces/pieces-framework";

type PassgradContext = Pick<PropertyContext, "passgrad">;

/** Shared table ID property resolved through the authenticated engine capability. */
export const tableIdProperty = Property.Dropdown<string, true>({
  auth: undefined,
  displayName: "Table",
  description: "The Passgrad table to use",
  refreshers: [],
  required: true,
  options: async (_propsValue, context) => {
    try {
      const response = await context.passgrad.request<{
        data: { id: string; name: string }[];
      }>({ operation: "table.list" });
      const tables = response.data ?? [];
      if (tables.length === 0) {
        return { disabled: true, options: [], placeholder: "No tables available" };
      }
      return {
        options: tables.map((table) => ({ label: table.name, value: table.id })),
      };
    } catch {
      return { disabled: true, options: [], placeholder: "Unable to load tables" };
    }
  },
});

/** Dynamic table fields refresh only when the selected table changes. */
export const recordFieldsProperty = Property.DynamicProperties<true>({
  auth: undefined,
  displayName: "Fields",
  description: "Record field values",
  refreshers: ["table_id"],
  required: true,
  props: async ({ table_id }, context) => {
    if (typeof table_id !== "string" || table_id.length === 0) return {};
    try {
      const response = await context.passgrad.request<{
        data: { id: string; name: string; type: string }[];
      }>({ operation: "table.get-fields", resourceId: table_id });
      const fields: Record<string, ReturnType<typeof Property.ShortText>> = {};
      for (const field of response.data ?? []) {
        fields[field.id] = Property.ShortText({
          displayName: field.name,
          description: `Type: ${field.type}`,
          required: false,
        });
      }
      return fields;
    } catch {
      return {};
    }
  },
});

export function passgradRequest<T>(context: PassgradContext, request: PassgradRequest) {
  return context.passgrad.request<T>(request);
}
