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

export function passgradRequest<T>(context: PassgradContext, request: PassgradRequest) {
  return context.passgrad.request<T>(request);
}
