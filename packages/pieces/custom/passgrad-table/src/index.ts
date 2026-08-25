import { createPiece, PieceAuth } from "@activepieces/pieces-framework";
import { newRecord } from "./lib/triggers/new-record";
import { updatedRecord } from "./lib/triggers/updated-record";
import { deletedRecord } from "./lib/triggers/deleted-record";
import { createRecord } from "./lib/actions/create-record";
import { updateRecord } from "./lib/actions/update-record";
import { getRecord } from "./lib/actions/get-record";
import { getRecordsByIds } from "./lib/actions/get-records-by-ids";

export const passgradTable = createPiece({
  displayName: "Passgrad Table",
  description:
    "Trigger flows on record changes in Passgrad tables, or manage table records from flows. " +
    "New records, updates, and deletions can all start or continue automations.",
  logoUrl: "https://asset-stg.pub-passgrad.com/pieces/passgrad-table.svg",
  minimumSupportedRelease: "0.30.0",
  authors: ["Passgrad"],
  auth: PieceAuth.None(),
  triggers: [newRecord, updatedRecord, deletedRecord],
  actions: [createRecord, updateRecord, getRecord, getRecordsByIds],
});
