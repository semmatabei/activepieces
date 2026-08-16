import { httpClient, HttpMethod } from "@activepieces/pieces-common";
import { PieceAuth, Property } from "@activepieces/pieces-framework";

export const passgradAuth = PieceAuth.CustomAuth({
  required: true,
  props: {
    baseUrl: Property.ShortText({
      displayName: "Base URL",
      description: "Passgrad API base URL. Example: https://api.passgrad.id/v1",
      required: true,
    }),
    tenantId: Property.ShortText({
      displayName: "Tenant ID",
      description: "Your Passgrad tenant ID",
      required: true,
    }),
  },
});

/** Dropdown to select a Passgrad table. */
export const tableIdProperty = Property.Dropdown<string, true, typeof passgradAuth>({
  auth: passgradAuth,
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
        url: `${auth.props.baseUrl}/tenants/${auth.props.tenantId}/tables`,
        headers: {
          "Content-Type": "application/json",
          ...getBindingHeaders(auth.props.tenantId),
        },
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
export const recordFieldsProperty = Property.DynamicProperties<true, typeof passgradAuth>({
  auth: passgradAuth,
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
        url: `${auth.props.baseUrl}/tenants/${auth.props.tenantId}/tables/${table_id}/fields`,
        headers: {
          "Content-Type": "application/json",
          ...getBindingHeaders(auth.props.tenantId),
        },
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

function getBindingHeaders(tenantId?: string) {
  const demoSecret = process.env["PASSGRAD_STAGING_DEMO_SECRET"];
  if (demoSecret && tenantId) {
    return {
      "x-passgrad-staging-demo-secret": demoSecret,
      "x-passgrad-staging-tenant-id": tenantId,
    };
  }
  const credentialId = process.env["PASSGRAD_BINDING_CREDENTIAL_ID"];
  const projectId = process.env["PASSGRAD_BINDING_PROJECT_ID"];
  const secret = process.env["PASSGRAD_BINDING_SECRET"];
  if (!credentialId || !projectId || !secret) return {};
  return {
    "x-passgrad-binding-credential-id": credentialId,
    "x-passgrad-binding-project-id": projectId,
    "x-passgrad-binding-secret": secret,
  };
}

export function passgradRequest<T>(
  auth: { props: { baseUrl: string; tenantId: string } },
  method: HttpMethod,
  path: string,
  body?: unknown,
) {
  return httpClient.sendRequest<T>({
    method,
    url: `${auth.props.baseUrl}/tenants/${auth.props.tenantId}${path}`,
    headers: {
      "Content-Type": "application/json",
      ...getBindingHeaders(auth.props.tenantId),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
