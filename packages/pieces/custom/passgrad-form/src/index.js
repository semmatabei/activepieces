var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __moduleCache = /* @__PURE__ */ new WeakMap;
var __toCommonJS = (from) => {
  var entry = __moduleCache.get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function")
    __getOwnPropNames(from).map((key) => !__hasOwnProp.call(entry, key) && __defProp(entry, key, {
      get: () => from[key],
      enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    }));
  __moduleCache.set(from, entry);
  return entry;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};

// src/index.ts
var exports_src = {};
__export(exports_src, {
  passgradForm: () => passgradForm
});
module.exports = __toCommonJS(exports_src);
var import_pieces_framework4 = require("@activepieces/pieces-framework");

// src/lib/common.ts
var import_pieces_common = require("@activepieces/pieces-common");
var import_pieces_framework = require("@activepieces/pieces-framework");
var PASSGRAD_BASE_URL = "https://api.passgrad.id/v1";
var passgradAuth = import_pieces_framework.PieceAuth.SecretText({
  displayName: "API Key",
  description: "Your Passgrad API key (obtained from Passgrad admin panel)",
  required: true
});
var formIdProperty = import_pieces_framework.Property.Dropdown({
  displayName: "Form",
  description: "The Passgrad form to use",
  refreshers: ["auth"],
  required: true,
  options: async ({ auth }) => {
    if (!auth) {
      return { disabled: true, options: [], placeholder: "Connect your Passgrad account first" };
    }
    try {
      const response = await import_pieces_common.httpClient.sendRequest({
        method: import_pieces_common.HttpMethod.GET,
        url: `${PASSGRAD_BASE_URL}/forms`,
        headers: { Authorization: `Bearer ${auth}` }
      });
      return {
        options: response.body.forms.map((f) => ({
          label: f.name,
          value: f.id
        }))
      };
    } catch {
      return { disabled: true, options: [], placeholder: "Failed to load forms" };
    }
  }
});
function passgradRequest(auth, method, path, body) {
  return import_pieces_common.httpClient.sendRequest({
    method,
    url: `${PASSGRAD_BASE_URL}${path}`,
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

// src/lib/triggers/new-submission.ts
var import_pieces_framework2 = require("@activepieces/pieces-framework");
var import_pieces_common2 = require("@activepieces/pieces-common");
var newSubmission = import_pieces_framework2.createTrigger({
  auth: passgradAuth,
  name: "new_submission",
  displayName: "New Submission",
  description: "Triggers when a new submission is received on the selected Passgrad form.",
  type: import_pieces_framework2.TriggerStrategy.APP_WEBHOOK,
  props: {
    form_id: formIdProperty
  },
  sampleData: {
    submission_id: "fs_abc123",
    form_id: "form_leave",
    submitted_by: "Bagus Pratama",
    submitted_at: "2025-06-26T12:00:00Z",
    data: {
      nama: "Bagus Pratama",
      jenis: "Cuti Tahunan",
      tgl_mulai: "2025-07-01",
      tgl_selesai: "2025-07-03",
      alasan: "Liburan keluarga"
    }
  },
  async onEnable(context) {
    const formId = context.propsValue.form_id;
    const webhookUrl = context.webhookUrl;
    const response = await passgradRequest(context.auth, import_pieces_common2.HttpMethod.POST, `/forms/${formId}/triggers`, { webhook_url: webhookUrl });
    await context.store.put("passgrad_trigger_id", response.body.trigger.id);
  },
  async onDisable(context) {
    const formId = context.propsValue.form_id;
    const triggerId = await context.store.get("passgrad_trigger_id");
    if (triggerId) {
      await passgradRequest(context.auth, import_pieces_common2.HttpMethod.DELETE, `/forms/${formId}/triggers/${triggerId}`);
    }
  },
  async run(context) {
    return [context.payload.body];
  },
  async test(context) {
    try {
      const response = await passgradRequest(context.auth, import_pieces_common2.HttpMethod.GET, `/forms/${context.propsValue.form_id}/submissions?limit=1`);
      if (response.body.submissions.length > 0) {
        return [response.body.submissions[0]];
      }
    } catch {}
    return [context.trigger.sampleData];
  }
});

// src/lib/actions/get-submission.ts
var import_pieces_framework3 = require("@activepieces/pieces-framework");
var import_pieces_common3 = require("@activepieces/pieces-common");
var getSubmission = import_pieces_framework3.createAction({
  auth: passgradAuth,
  name: "get_submission",
  displayName: "Get Submission",
  description: "Retrieve a specific form submission by its ID.",
  props: {
    form_id: formIdProperty,
    submission_id: import_pieces_framework3.Property.ShortText({
      displayName: "Submission ID",
      description: "The ID of the submission to retrieve",
      required: true
    })
  },
  async run(context) {
    const { form_id, submission_id } = context.propsValue;
    const response = await passgradRequest(context.auth, import_pieces_common3.HttpMethod.GET, `/forms/${form_id}/submissions/${submission_id}`);
    return response.body;
  }
});

// src/index.ts
var passgradForm = import_pieces_framework4.createPiece({
  displayName: "Passgrad Form",
  description: "Collect structured data via Passgrad forms. Trigger flows on new submissions, or retrieve submission data mid-flow.",
  logoUrl: "https://cdn.passgrad.id/logos/passgrad-form.png",
  minimumSupportedRelease: "0.30.0",
  authors: ["Passgrad"],
  auth: passgradAuth,
  triggers: [newSubmission],
  actions: [getSubmission]
});
