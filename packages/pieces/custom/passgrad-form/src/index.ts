import { createPiece, PieceAuth } from "@activepieces/pieces-framework";
import { newSubmission } from "./lib/triggers/new-submission";
import { newSubmissionV2 } from "./lib/triggers/new-submission-v2";
import { getSubmission } from "./lib/actions/get-submission";
import { requestSubmission } from "./lib/actions/request-submission";
import { requestApprovalV2 } from "./lib/actions/request-approval-v2";
import { requestAction } from "./lib/actions/request-action";
import { addInformation } from "./lib/actions/add-information";
import { completeProcess } from "./lib/actions/complete-process";
import { openPersuratanCase } from "./lib/actions/open-persuratan-case";
import { waitForPersuratanCaseResolution } from "./lib/actions/wait-for-persuratan-case-resolution";

export const passgradForm = createPiece({
  displayName: "Passgrad Form",
  description: "Collect structured data via Passgrad forms. Trigger flows on new submissions, retrieve submissions, or pause a flow for an assigned member.",
  logoUrl: "https://asset-stg.pub-passgrad.com/pieces/passgrad-form.svg",
  minimumSupportedRelease: "0.30.0",
  authors: ["Passgrad"],
  auth: PieceAuth.None(),
  triggers: [newSubmissionV2, newSubmission],
  actions: [getSubmission, requestSubmission, requestAction, requestApprovalV2, addInformation, completeProcess, openPersuratanCase, waitForPersuratanCaseResolution],
});
