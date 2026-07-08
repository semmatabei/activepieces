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
  passgradTable: () => passgradTable
});
module.exports = __toCommonJS(exports_src);
var import_pieces_framework8 = require("@activepieces/pieces-framework");

// src/lib/common.ts
var import_pieces_common = require("@activepieces/pieces-common");
var import_pieces_framework = require("@activepieces/pieces-framework");
var PASSGRAD_BASE_URL = "https://api.passgrad.id/v1";
var passgradAuth = import_pieces_framework.PieceAuth.SecretText({
  displayName: "API Key",
  description: "Your Passgrad API key",
  required: true
});
var tableIdProperty = import_pieces_framework.Property.Dropdown({
  displayName: "Table",
  description: "The Passgrad table to use",
  refreshers: ["auth"],
  required: true,
  options: async ({ auth }) => {
    if (!auth) {
      return { disabled: true, options: [], placeholder: "Connect your Passgrad account first" };
    }
    try {
      const response = await import_pieces_common.httpClient.sendRequest({
        method: import_pieces_common.HttpMethod.GET,
        url: `${PASSGRAD_BASE_URL}/tables`,
        headers: { Authorization: `Bearer ${auth}` }
      });
      return {
        options: response.body.tables.map((t) => ({
          label: t.name,
          value: t.id
        }))
      };
    } catch {
      return { disabled: true, options: [], placeholder: "Failed to load tables" };
    }
  }
});
var recordFieldsProperty = import_pieces_framework.Property.DynamicProperties({
  displayName: "Fields",
  description: "Record field values",
  refreshers: ["auth", "table_id"],
  required: true,
  props: async ({ auth, table_id }) => {
    if (!auth || !table_id)
      return {};
    try {
      const response = await import_pieces_common.httpClient.sendRequest({
        method: import_pieces_common.HttpMethod.GET,
        url: `${PASSGRAD_BASE_URL}/tables/${table_id}/fields`,
        headers: { Authorization: `Bearer ${auth}` }
      });
      const props = {};
      for (const f of response.body.fields) {
        props[f.id] = import_pieces_framework.Property.ShortText({
          displayName: f.name,
          description: `Type: ${f.type}`,
          required: false
        });
      }
      return props;
    } catch {
      return {};
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

// src/lib/triggers/new-record.ts
var import_pieces_framework2 = require("@activepieces/pieces-framework");
var import_pieces_common2 = require("@activepieces/pieces-common");
var newRecord = import_pieces_framework2.createTrigger({
  auth: passgradAuth,
  name: "new_record",
  displayName: "New Record",
  description: "Triggers when a new record is created in the selected Passgrad table.",
  type: import_pieces_framework2.TriggerStrategy.APP_WEBHOOK,
  props: { table_id: tableIdProperty },
  sampleData: {
    record_id: "rec_abc123",
    table_id: "tb_mahasiswa",
    created_at: "2025-06-26T12:00:00Z",
    data: { f_mhs_nama: "Ahmad Fauzi", f_mhs_status: "aktif" }
  },
  async onEnable(context) {
    const response = await passgradRequest(context.auth, import_pieces_common2.HttpMethod.POST, `/tables/${context.propsValue.table_id}/triggers`, { webhook_url: context.webhookUrl, event_type: "create" });
    await context.store.put("passgrad_trigger_id", response.body.trigger.id);
  },
  async onDisable(context) {
    const triggerId = await context.store.get("passgrad_trigger_id");
    if (triggerId) {
      await passgradRequest(context.auth, import_pieces_common2.HttpMethod.DELETE, `/tables/${context.propsValue.table_id}/triggers/${triggerId}`);
    }
  },
  async run(context) {
    return [context.payload.body];
  },
  async test(context) {
    try {
      const response = await passgradRequest(context.auth, import_pieces_common2.HttpMethod.GET, `/tables/${context.propsValue.table_id}/records?limit=1&sort=-created_at`);
      if (response.body.records.length > 0)
        return [response.body.records[0]];
    } catch {}
    return [context.trigger.sampleData];
  }
});

// src/lib/triggers/updated-record.ts
var import_pieces_framework3 = require("@activepieces/pieces-framework");
var import_pieces_common3 = require("@activepieces/pieces-common");
var updatedRecord = import_pieces_framework3.createTrigger({
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
    const response = await passgradRequest(context.auth, import_pieces_common3.HttpMethod.POST, `/tables/${context.propsValue.table_id}/triggers`, { webhook_url: context.webhookUrl, event_type: "update" });
    await context.store.put("passgrad_trigger_id", response.body.trigger.id);
  },
  async onDisable(context) {
    const triggerId = await context.store.get("passgrad_trigger_id");
    if (triggerId) {
      await passgradRequest(context.auth, import_pieces_common3.HttpMethod.DELETE, `/tables/${context.propsValue.table_id}/triggers/${triggerId}`);
    }
  },
  async run(context) {
    return [context.payload.body];
  }
});

// src/lib/triggers/deleted-record.ts
var import_pieces_framework4 = require("@activepieces/pieces-framework");
var import_pieces_common4 = require("@activepieces/pieces-common");
var deletedRecord = import_pieces_framework4.createTrigger({
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
    const response = await passgradRequest(context.auth, import_pieces_common4.HttpMethod.POST, `/tables/${context.propsValue.table_id}/triggers`, { webhook_url: context.webhookUrl, event_type: "delete" });
    await context.store.put("passgrad_trigger_id", response.body.trigger.id);
  },
  async onDisable(context) {
    const triggerId = await context.store.get("passgrad_trigger_id");
    if (triggerId) {
      await passgradRequest(context.auth, import_pieces_common4.HttpMethod.DELETE, `/tables/${context.propsValue.table_id}/triggers/${triggerId}`);
    }
  },
  async run(context) {
    return [context.payload.body];
  }
});

// src/lib/actions/create-record.ts
var import_pieces_framework5 = require("@activepieces/pieces-framework");
var import_pieces_common5 = require("@activepieces/pieces-common");
var createRecord = import_pieces_framework5.createAction({
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
    const response = await passgradRequest(context.auth, import_pieces_common5.HttpMethod.POST, `/tables/${table_id}/records`, { values: fields });
    return response.body.record;
  }
});

// src/lib/actions/update-record.ts
var import_pieces_framework6 = require("@activepieces/pieces-framework");
var import_pieces_common6 = require("@activepieces/pieces-common");
var updateRecord = import_pieces_framework6.createAction({
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
    const response = await passgradRequest(context.auth, import_pieces_common6.HttpMethod.PATCH, `/tables/${table_id}/records/${record_id}`, { values: fields });
    return response.body.record;
  }
});

// src/lib/actions/get-record.ts
var import_pieces_framework7 = require("@activepieces/pieces-framework");
var import_pieces_common7 = require("@activepieces/pieces-common");
var getRecord = import_pieces_framework7.createAction({
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
    const response = await passgradRequest(context.auth, import_pieces_common7.HttpMethod.GET, `/tables/${table_id}/records/${record_id}`);
    return response.body.record;
  }
});

// src/index.ts
var passgradTable = import_pieces_framework8.createPiece({
  displayName: "Passgrad Table",
  description: "Trigger flows on record changes in Passgrad tables, or manage table records from flows. " + "New records, updates, and deletions can all start or continue automations.",
  logoUrl: "https://cdn.passgrad.id/logos/passgrad-table.png",
  minimumSupportedRelease: "0.30.0",
  authors: ["Passgrad"],
  auth: passgradAuth,
  triggers: [newRecord, updatedRecord, deletedRecord],
  actions: [createRecord, updateRecord, getRecord]
});
