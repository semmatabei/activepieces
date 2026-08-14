import { createCustomApiCallAction, httpClient, HttpMethod } from "@activepieces/pieces-common";
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

/** Shared form ID property — used by both triggers and actions to select which form. */
export const formIdProperty = Property.Dropdown<string, true, typeof passgradAuth>({
  auth: passgradAuth,
  displayName: "Form",
  description: "The Passgrad form to use",
  refreshers: ["auth"],
  required: true,
  options: async ({ auth }) => {
    if (!auth) {
      return { disabled: true, options: [], placeholder: "Connect your Passgrad account first" };
    }

    try {
      const response = await httpClient.sendRequest<{
        data: { id: string; name: string }[];
      }>({
        method: HttpMethod.GET,
        url: `${auth.props.baseUrl}/tenants/${auth.props.tenantId}/forms`,
        headers: {
          "Content-Type": "application/json",
          ...getBindingHeaders(),
        },
      });

      return {
        options: response.body.data.map((f) => ({
          label: f.name,
          value: f.id,
        })),
      };
    } catch {
      return { disabled: true, options: [], placeholder: "Failed to load forms" };
    }
  },
});

function getBindingHeaders() {
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

function getCallbackHeaders() {
  const credentialId = process.env["PASSGRAD_BINDING_CREDENTIAL_ID"];
  const projectId = process.env["PASSGRAD_BINDING_PROJECT_ID"];
  const secret = process.env["PASSGRAD_BINDING_SECRET"];
  if (!credentialId || !projectId || !secret) {
    throw new Error("Passgrad binding credentials are unavailable");
  }
  return {
    "x-passgrad-callback-credential-id": credentialId,
    "x-passgrad-callback-secret": secret,
    "x-passgrad-project-id": projectId,
  };
}

/** Helper to build an authenticated request to Passgrad API. */
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
      ...getBindingHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Authenticated Activepieces callback; tenant scope always comes from its persisted binding. */
export function passgradCallbackRequest<T>(
  auth: { props: { baseUrl: string } },
  method: HttpMethod,
  path: string,
  body: unknown,
) {
  return httpClient.sendRequest<T>({
    method,
    url: `${auth.props.baseUrl}${path}`,
    headers: {
      "Content-Type": "application/json",
      ...getCallbackHeaders(),
    },
    body: JSON.stringify(body),
    responseType: "text",
  });
}
