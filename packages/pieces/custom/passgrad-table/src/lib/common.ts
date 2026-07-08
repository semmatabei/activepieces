import { httpClient, HttpMethod } from "@activepieces/pieces-common";
import { PieceAuth, Property } from "@activepieces/pieces-framework";

const PASSGRAD_BASE_URL = "https://api.passgrad.id/v1";

export const passgradAuth = PieceAuth.SecretText({
  displayName: "API Key",
  description: "Your Passgrad API key",
  required: true,
});

/** Dropdown to select a Passgrad table. */
export const tableIdProperty = Property.Dropdown({
  displayName: "Table",
  description: "The Passgrad table to use",
  refreshers: ["auth"],
  required: true,
  options: async ({ auth }) => {
    if (!auth) {
      return { disabled: true, options: [], placeholder: "Connect your Passgrad account first" };
    }
    try {
      const response = await httpClient.sendRequest<{ tables: { id: string; name: string }[] }>({
        method: HttpMethod.GET,
        url: `${PASSGRAD_BASE_URL}/tables`,
        headers: { Authorization: `Bearer ${auth}` },
      });
      return {
        options: response.body.tables.map((t) => ({
          label: t.name,
          value: t.id,
        })),
      };
    } catch {
      return { disabled: true, options: [], placeholder: "Failed to load tables" };
    }
  },
});

/** Description of record fields from the table schema, for use when creating/updating records. */
export const recordFieldsProperty = Property.DynamicProperties({
  displayName: "Fields",
  description: "Record field values",
  refreshers: ["auth", "table_id"],
  required: true,
  props: async ({ auth, table_id }) => {
    if (!auth || !table_id) return {};
    try {
      const response = await httpClient.sendRequest<{
        fields: { id: string; name: string; type: string }[];
      }>({
        method: HttpMethod.GET,
        url: `${PASSGRAD_BASE_URL}/tables/${table_id}/fields`,
        headers: { Authorization: `Bearer ${auth}` },
      });
      const props: Record<string, ReturnType<typeof Property.ShortText>> = {};
      for (const f of response.body.fields) {
        props[f.id] = Property.ShortText({
          displayName: f.name,
          description: `Type: ${f.type}`,
          required: false,
        });
      }
      return props;
    } catch {
      return {};
    }
  },
});

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
