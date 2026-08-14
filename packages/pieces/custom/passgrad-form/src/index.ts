import { createPiece } from "@activepieces/pieces-framework";
import { passgradAuth } from "./lib/common";
import { newSubmission } from "./lib/triggers/new-submission";
import { getSubmission } from "./lib/actions/get-submission";
import { reportWorkflowStatus } from "./lib/actions/report-workflow-status";
import { requestSubmission } from "./lib/actions/request-submission";
import { requestApproval } from "./lib/actions/request-approval";

export const passgradForm = createPiece({
  displayName: "Passgrad Form",
  description:
    "Collect structured data via Passgrad forms. Trigger flows on new submissions, retrieve submissions, or pause a flow for an assigned member.",
  logoUrl: "https://asset-stg.pub-passgrad.com/pieces/passgrad-form.svg",
  minimumSupportedRelease: "0.30.0",
  authors: ["Passgrad"],
  auth: passgradAuth,
  triggers: [newSubmission],
  actions: [getSubmission, requestSubmission, requestApproval, reportWorkflowStatus],
});
