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

// notion/actions/create-page.ts
var create_page_exports = {};
__export(create_page_exports, {
  default: () => create_page_default
});
module.exports = __toCommonJS(create_page_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  parent: import_zod.z.object({
    page_id: import_zod.z.string().optional().describe("ID of the parent page. Provide either page_id or database_id, not both."),
    database_id: import_zod.z.string().optional().describe("ID of the parent database. Provide either database_id or page_id, not both.")
  }).describe("Parent container for the new page. Must include exactly one of page_id or database_id."),
  properties: import_zod.z.record(import_zod.z.any()).describe("Page properties object. For database parents, must match the database schema. For page parents, use a 'title' property with rich text."),
  children: import_zod.z.array(import_zod.z.any()).optional().describe("Array of block objects to append as the initial page content."),
  icon: import_zod.z.any().optional().describe("Page icon — either an emoji object { type: 'emoji', emoji: '...' } or external URL object { type: 'external', external: { url: '...' } }."),
  cover: import_zod.z.any().optional().describe("Page cover image as an external URL object { type: 'external', external: { url: '...' } }.")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("Unique identifier of the created page."),
  object: import_zod.z.string().describe("Always 'page' for page objects."),
  created_time: import_zod.z.string().describe("ISO 8601 timestamp when the page was created."),
  last_edited_time: import_zod.z.string().describe("ISO 8601 timestamp when the page was last edited."),
  parent: import_zod.z.any().describe("Parent object indicating where this page lives."),
  archived: import_zod.z.boolean().describe("Whether the page is archived (in trash)."),
  url: import_zod.z.string().describe("URL of the page in Notion."),
  properties: import_zod.z.record(import_zod.z.any()).describe("Page properties as defined by the parent database schema or page title.")
});

var action = {
  type: "action",
  description: "Create a new page in Notion under a parent page or database.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/notion/create-page", group: "Pages" },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const body = {
      parent: input.parent,
      properties: input.properties
    };
    if (input.children) {
      body.children = input.children;
    }
    if (input.icon) {
      body.icon = input.icon;
    }
    if (input.cover) {
      body.cover = input.cover;
    }
    const response = await nango.post({
      endpoint: "v1/pages",
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

var create_page_default = action;
