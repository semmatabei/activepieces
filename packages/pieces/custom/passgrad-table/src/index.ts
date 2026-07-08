import { createPiece } from "@activepieces/pieces-framework";
import { passgradAuth } from "./lib/common";
import { newRecord } from "./lib/triggers/new-record";
import { updatedRecord } from "./lib/triggers/updated-record";
import { deletedRecord } from "./lib/triggers/deleted-record";
import { createRecord } from "./lib/actions/create-record";
import { updateRecord } from "./lib/actions/update-record";
import { getRecord } from "./lib/actions/get-record";

export const passgradTable = createPiece({
  displayName: "Passgrad Table",
  description:
    "Trigger flows on record changes in Passgrad tables, or manage table records from flows. " +
    "New records, updates, and deletions can all start or continue automations.",
  logoUrl: "https://cdn.passgrad.id/logos/passgrad-table.png",
  minimumSupportedRelease: "0.30.0",
  authors: ["Passgrad"],
  auth: passgradAuth,
  triggers: [newRecord, updatedRecord, deletedRecord],
  actions: [createRecord, updateRecord, getRecord],
});
