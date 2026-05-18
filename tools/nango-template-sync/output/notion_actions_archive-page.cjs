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

// notion/actions/archive-page.ts
var archive_page_exports = {};
__export(archive_page_exports, {
  default: () => archive_page_default
});
module.exports = __toCommonJS(archive_page_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  page_id: import_zod.z.string().describe("The ID of the page to archive (move to trash).")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("Unique identifier of the archived page."),
  object: import_zod.z.string().describe("Always 'page' for page objects."),
  created_time: import_zod.z.string().describe("ISO 8601 timestamp when the page was created."),
  last_edited_time: import_zod.z.string().describe("ISO 8601 timestamp when the page was last edited."),
  parent: import_zod.z.any().describe("Parent object indicating where this page lives."),
  archived: import_zod.z.boolean().describe("Whether the page is archived. Will be true after this action."),
  url: import_zod.z.string().describe("URL of the page in Notion."),
  properties: import_zod.z.record(import_zod.z.any()).describe("Page properties at the time of archiving.")
});

var action = {
  type: "action",
  description: "Archive (move to trash) a Notion page by setting its archived status to true.",
  version: "1.0.0",
  endpoint: { method: "PATCH", path: "/notion/archive-page", group: "Pages" },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const response = await nango.patch({
      endpoint: `v1/pages/${input.page_id}`,
      data: { archived: true },
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

var archive_page_default = action;
