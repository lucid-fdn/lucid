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

// notion/actions/retrieve-database.ts
var retrieve_database_exports = {};
__export(retrieve_database_exports, {
  default: () => retrieve_database_default
});
module.exports = __toCommonJS(retrieve_database_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  database_id: import_zod.z.string().describe("The ID of the database to retrieve.")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("Unique identifier of the database."),
  object: import_zod.z.string().describe("Always 'database' for database objects."),
  created_time: import_zod.z.string().describe("ISO 8601 timestamp when the database was created."),
  last_edited_time: import_zod.z.string().describe("ISO 8601 timestamp when the database was last edited."),
  parent: import_zod.z.any().describe("Parent object indicating where this database lives."),
  archived: import_zod.z.boolean().describe("Whether the database is archived."),
  url: import_zod.z.string().describe("URL of the database in Notion."),
  properties: import_zod.z.record(import_zod.z.any()).describe("Database property schema defining column types and configuration.")
});

var action = {
  type: "action",
  description: "Retrieve a Notion database by its ID, including the full property schema.",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/notion/retrieve-database", group: "Databases" },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const response = await nango.get({
      endpoint: `v1/databases/${input.database_id}`,
      retries: 3
    });
    const data = response.data;
    if (data?.object === "error") {
      throw new nango.ActionError({
        type: "notion_error",
        message: data.message || "Notion API error",
        status: data.status
      });
    }
    return {
      id: data.id,
      object: data.object,
      created_time: data.created_time,
      last_edited_time: data.last_edited_time,
      parent: data.parent,
      archived: data.archived || false,
      url: data.url,
      properties: data.properties
    };
  }
};

var retrieve_database_default = action;
