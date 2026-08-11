"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  passgradForm: () => passgradForm
});
module.exports = __toCommonJS(index_exports);
var import_pieces_framework5 = require("@activepieces/pieces-framework");

// src/lib/common.ts
var import_pieces_framework = require("@activepieces/pieces-framework");
var passgradAuth = import_pieces_framework.PieceAuth.None();
var formIdProperty = import_pieces_framework.Property.ShortText({
  displayName: "Form ID",
  description: "Passgrad form ID",
  required: true
});

// src/lib/triggers/new-submission.ts
var import_pieces_framework2 = require("@activepieces/pieces-framework");
var sampleData = {
  event: "form.submitted.v1",
  formId: "019c70d8-e000-7000-8000-000000000001",
  submissionId: "019c70d8-e000-7000-8000-000000000002"
};
var newSubmission = (0, import_pieces_framework2.createTrigger)({
  auth: passgradAuth,
  name: "new_submission",
  displayName: "New Submission",
  description: "Triggers when a new submission is received. Use Get Submission to retrieve its payload.",
  type: import_pieces_framework2.TriggerStrategy.APP_WEBHOOK,
  props: {
    form_id: formIdProperty
  },
  sampleData,
  async onEnable(context) {
    const formId = context.propsValue.form_id;
    const webhookUrl = context.webhookUrl;
    const response = await context.passgrad.request({
      operation: "form.create-trigger",
      resourceId: formId,
      payload: { webhook_url: webhookUrl }
    });
    await context.store.put("passgrad_trigger_id", response.data.id);
  },
  async onDisable(context) {
    const formId = context.propsValue.form_id;
    const triggerId = await context.store.get("passgrad_trigger_id");
    if (triggerId) {
      await context.passgrad.request({ operation: "form.delete-trigger", resourceId: formId, payload: { triggerId } });
    }
  },
  async run(context) {
    return [context.payload.body];
  },
  async test(context) {
    try {
      const response = await context.passgrad.request({ operation: "form.list-submissions", resourceId: context.propsValue.form_id });
      if (response.data.length > 0) {
        return [response.data[0]];
      }
    } catch {
    }
    return [sampleData];
  }
});

// src/lib/actions/get-submission.ts
var import_pieces_framework3 = require("@activepieces/pieces-framework");
var getSubmission = (0, import_pieces_framework3.createAction)({
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
    const response = await context.passgrad.request({ operation: "form.get-submission", resourceId: form_id, payload: { submissionId: submission_id } });
    return response.data;
  }
});

// src/lib/actions/request-submission.ts
var import_pieces_framework4 = require("@activepieces/pieces-framework");
var actorUserIdProperty = import_pieces_framework4.Property.ShortText({
  displayName: "Assigned user ID",
  description: "Passgrad user ID of the current tenant member who must submit this Form.",
  required: true
});
var requestSubmission = (0, import_pieces_framework4.createAction)({
  auth: passgradAuth,
  name: "request_submission",
  displayName: "Request submission",
  description: "Pause the flow until an assigned Passgrad member submits a published Form.",
  props: {
    form_id: formIdProperty,
    actor_user_id: actorUserIdProperty
  },
  async run(context) {
    if ("resumePayload" in context && context.resumePayload) {
      return context.resumePayload.body;
    }
    const waitpoint = await context.run.createWaitpoint({ type: "WEBHOOK", version: "V1" });
    const response = await context.passgrad.request({
      operation: "form.open-workflow-session",
      payload: {
        actorUserId: context.propsValue.actor_user_id,
        formId: context.propsValue.form_id,
        resumeUrl: waitpoint.buildResumeUrl({ queryParams: {} }),
        workflowNodeReference: context.step.name,
        workflowReference: context.flows.current.id,
        workflowRunReference: context.run.id
      }
    });
    context.run.waitForWaitpoint(waitpoint.id);
    return { sessionId: response.data.id, status: "waiting" };
  }
});

// src/index.ts
var passgradForm = (0, import_pieces_framework5.createPiece)({
  displayName: "Passgrad Form",
  description: "Collect structured data via Passgrad forms. Trigger flows on new submissions, retrieve submissions, or pause a flow for an assigned member.",
  logoUrl: "https://cdn.passgrad.id/logos/passgrad-form.png",
  minimumSupportedRelease: "0.30.0",
  authors: ["Passgrad"],
  auth: passgradAuth,
  triggers: [newSubmission],
  actions: [getSubmission, requestSubmission]
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  passgradForm
});
