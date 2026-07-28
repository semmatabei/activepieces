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
  passgradTable: () => passgradTable
});
module.exports = __toCommonJS(index_exports);
var import_pieces_framework8 = require("@activepieces/pieces-framework");

// src/lib/common.ts
var import_pieces_framework = require("@activepieces/pieces-framework");
var passgradAuth = import_pieces_framework.PieceAuth.None();
var tableIdProperty = import_pieces_framework.Property.ShortText({
  displayName: "Table ID",
  description: "Passgrad table ID",
  required: true
});
var recordFieldsProperty = import_pieces_framework.Property.Json({
  displayName: "Fields",
  description: "Record field values keyed by field ID",
  required: true
});

// src/lib/triggers/new-record.ts
var import_pieces_framework2 = require("@activepieces/pieces-framework");
var sampleData = {
  record_id: "rec_abc123",
  table_id: "tb_mahasiswa",
  created_at: "2025-06-26T12:00:00Z",
  data: { f_mhs_nama: "Ahmad Fauzi", f_mhs_status: "aktif" }
};
var newRecord = (0, import_pieces_framework2.createTrigger)({
  auth: passgradAuth,
  name: "new_record",
  displayName: "New Record",
  description: "Triggers when a new record is created in the selected Passgrad table.",
  type: import_pieces_framework2.TriggerStrategy.APP_WEBHOOK,
  props: { table_id: tableIdProperty },
  sampleData,
  async onEnable(context) {
    const response = await context.passgrad.request({ operation: "table.create-trigger", resourceId: context.propsValue.table_id, payload: { webhook_url: context.webhookUrl, event_type: "create" } });
    await context.store.put("passgrad_trigger_id", response.data.id);
  },
  async onDisable(context) {
    const triggerId = await context.store.get("passgrad_trigger_id");
    if (triggerId) {
      await context.passgrad.request({ operation: "table.delete-trigger", resourceId: context.propsValue.table_id, payload: { triggerId } });
    }
  },
  async run(context) {
    return [context.payload.body];
  },
  async test(context) {
    try {
      const response = await context.passgrad.request({ operation: "table.list-records", resourceId: context.propsValue.table_id });
      if (response.records.length > 0) return [response.records[0]];
    } catch {
    }
    return [sampleData];
  }
});

// src/lib/triggers/updated-record.ts
var import_pieces_framework3 = require("@activepieces/pieces-framework");
var updatedRecord = (0, import_pieces_framework3.createTrigger)({
  auth: passgradAuth,
  name: "updated_record",
  displayName: "Updated Record",
  description: "Triggers when a record is updated in the selected Passgrad table.",
  type: import_pieces_framework3.TriggerStrategy.APP_WEBHOOK,
  props: { table_id: tableIdProperty },
  sampleData: {
    record_id: "rec_abc123",
    table_id: "tb_mahasiswa",
    updated_at: "2025-06-26T14:30:00Z",
    changes: { f_mhs_status: { old: "aktif", new: "tidak_aktif" } }
  },
  async onEnable(context) {
    const response = await context.passgrad.request({ operation: "table.create-trigger", resourceId: context.propsValue.table_id, payload: { webhook_url: context.webhookUrl, event_type: "update" } });
    await context.store.put("passgrad_trigger_id", response.data.id);
  },
  async onDisable(context) {
    const triggerId = await context.store.get("passgrad_trigger_id");
    if (triggerId) {
      await context.passgrad.request({ operation: "table.delete-trigger", resourceId: context.propsValue.table_id, payload: { triggerId } });
    }
  },
  async run(context) {
    return [context.payload.body];
  }
});

// src/lib/triggers/deleted-record.ts
var import_pieces_framework4 = require("@activepieces/pieces-framework");
var deletedRecord = (0, import_pieces_framework4.createTrigger)({
  auth: passgradAuth,
  name: "deleted_record",
  displayName: "Deleted Record",
  description: "Triggers when a record is deleted from the selected Passgrad table.",
  type: import_pieces_framework4.TriggerStrategy.APP_WEBHOOK,
  props: { table_id: tableIdProperty },
  sampleData: {
    record_id: "rec_abc123",
    table_id: "tb_mahasiswa",
    deleted_at: "2025-06-26T16:00:00Z",
    data: { f_mhs_nama: "Ahmad Fauzi", f_mhs_status: "tidak_aktif" }
  },
  async onEnable(context) {
    const response = await context.passgrad.request({ operation: "table.create-trigger", resourceId: context.propsValue.table_id, payload: { webhook_url: context.webhookUrl, event_type: "delete" } });
    await context.store.put("passgrad_trigger_id", response.data.id);
  },
  async onDisable(context) {
    const triggerId = await context.store.get("passgrad_trigger_id");
    if (triggerId) {
      await context.passgrad.request({ operation: "table.delete-trigger", resourceId: context.propsValue.table_id, payload: { triggerId } });
    }
  },
  async run(context) {
    return [context.payload.body];
  }
});

// src/lib/actions/create-record.ts
var import_pieces_framework5 = require("@activepieces/pieces-framework");
var createRecord = (0, import_pieces_framework5.createAction)({
  auth: passgradAuth,
  name: "create_record",
  displayName: "Create Record",
  description: "Insert a new record into the selected Passgrad table.",
  props: {
    table_id: tableIdProperty,
    fields: recordFieldsProperty
  },
  async run(context) {
    const { table_id, fields } = context.propsValue;
    const response = await context.passgrad.request({
      operation: "table.create-record",
      resourceId: table_id,
      payload: { values: fields }
    });
    return response.record;
  }
});

// src/lib/actions/update-record.ts
var import_pieces_framework6 = require("@activepieces/pieces-framework");
var updateRecord = (0, import_pieces_framework6.createAction)({
  auth: passgradAuth,
  name: "update_record",
  displayName: "Update Record",
  description: "Update an existing record in the selected Passgrad table.",
  props: {
    table_id: tableIdProperty,
    record_id: import_pieces_framework6.Property.ShortText({
      displayName: "Record ID",
      description: "ID of the record to update",
      required: true
    }),
    fields: recordFieldsProperty
  },
  async run(context) {
    const { table_id, record_id, fields } = context.propsValue;
    const response = await context.passgrad.request({
      operation: "table.update-record",
      resourceId: table_id,
      payload: { recordId: record_id, values: fields }
    });
    return response.record;
  }
});

// src/lib/actions/get-record.ts
var import_pieces_framework7 = require("@activepieces/pieces-framework");
var getRecord = (0, import_pieces_framework7.createAction)({
  auth: passgradAuth,
  name: "get_record",
  displayName: "Get Record",
  description: "Retrieve a specific record from the selected Passgrad table.",
  props: {
    table_id: tableIdProperty,
    record_id: import_pieces_framework7.Property.ShortText({
      displayName: "Record ID",
      description: "ID of the record to retrieve",
      required: true
    })
  },
  async run(context) {
    const { table_id, record_id } = context.propsValue;
    const response = await context.passgrad.request({
      operation: "table.get-record",
      resourceId: table_id,
      payload: { recordId: record_id }
    });
    return response.record;
  }
});

// src/index.ts
var passgradTable = (0, import_pieces_framework8.createPiece)({
  displayName: "Passgrad Table",
  description: "Trigger flows on record changes in Passgrad tables, or manage table records from flows. New records, updates, and deletions can all start or continue automations.",
  logoUrl: "https://cdn.passgrad.id/logos/passgrad-table.png",
  minimumSupportedRelease: "0.30.0",
  authors: ["Passgrad"],
  auth: passgradAuth,
  triggers: [newRecord, updatedRecord, deletedRecord],
  actions: [createRecord, updateRecord, getRecord]
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  passgradTable
});
