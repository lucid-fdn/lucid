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

// notion/actions/create-database.ts
var create_database_exports = {};
__export(create_database_exports, {
  default: () => create_database_default
});
module.exports = __toCommonJS(create_database_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  parent: import_zod.z.object({
    page_id: import_zod.z.string().describe("ID of the parent page where the database will be created.")
  }).describe("Parent page for the new database. Databases must be created inside a page."),
  title: import_zod.z.array(import_zod.z.any()).describe("Database title as a rich text array, e.g. [{ type: 'text', text: { content: 'My Database' } }]."),
  properties: import_zod.z.record(import_zod.z.any()).describe("Database property schema defining columns. Each key is a property name, value defines the type and configuration (e.g. { 'Name': { title: {} }, 'Status': { select: { options: [...] } } }).")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("Unique identifier of the created database."),
  object: import_zod.z.string().describe("Always 'database' for database objects."),
  created_time: import_zod.z.string().describe("ISO 8601 timestamp when the database was created."),
  last_edited_time: import_zod.z.string().describe("ISO 8601 timestamp when the database was last edited."),
  parent: import_zod.z.any().describe("Parent object indicating where this database lives."),
  archived: import_zod.z.boolean().describe("Whether the database is archived."),
  url: import_zod.z.string().describe("URL of the database in Notion."),
  properties: import_zod.z.record(import_zod.z.any()).describe("Database property schema as created.")
});

var action = {
  type: "action",
  description: "Create a new database inside a Notion page with a defined property schema.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/notion/create-database", group: "Databases" },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const body = {
      parent: input.parent,
      title: input.title,
      properties: input.properties
    };
    const response = await nango.post({
      endpoint: "v1/databases",
      data: body,
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

var create_database_default = action;
