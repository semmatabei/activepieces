import { createCustomApiCallAction, httpClient, HttpMethod } from "@activepieces/pieces-common";
import { PieceAuth, Property } from "@activepieces/pieces-framework";

/**
 * Passgrad API base URL — configured per environment.
 * In production, defaults to the Passgrad instance URL.
 */
const PASSGRAD_BASE_URL = "https://api.passgrad.id/v1";

/**
 * Auth for the Passgrad Form piece.
 * Uses a Bearer token (API key issued by Passgrad admin).
 * The piece must be connected to a Passgrad tenant before triggers/actions can be used.
 */
export const passgradAuth = PieceAuth.SecretText({
  displayName: "API Key",
  description: "Your Passgrad API key (obtained from Passgrad admin panel)",
  required: true,
});

/**
 * Shared form ID property — used by both triggers and actions to select which form.
 * Populated by calling GET /forms (list of forms available to the authenticated tenant).
 */
export const formIdProperty = Property.Dropdown({
  displayName: "Form",
  description: "The Passgrad form to use",
  refreshers: ["auth"],
  required: true,
  options: async ({ auth }) => {
    if (!auth) {
      return { disabled: true, options: [], placeholder: "Connect your Passgrad account first" };
    }

    try {
      const response = await httpClient.sendRequest<{ forms: { id: string; name: string }[] }>({
        method: HttpMethod.GET,
        url: `${PASSGRAD_BASE_URL}/forms`,
        headers: { Authorization: `Bearer ${auth}` },
      });

      return {
        options: response.body.forms.map((f) => ({
          label: f.name,
          value: f.id,
        })),
      };
    } catch {
      return { disabled: true, options: [], placeholder: "Failed to load forms" };
    }
  },
});

/**
 * Helper to build an authenticated request to Passgrad API.
 */
export function passgradRequest<T>(auth: string, method: HttpMethod, path: string, body?: unknown) {
  return httpClient.sendRequest<T>({
    method,
    url: `${PASSGRAD_BASE_URL}${path}`,
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
