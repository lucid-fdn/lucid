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

// notion/actions/list-users.ts
var list_users_exports = {};
__export(list_users_exports, {
  default: () => list_users_default
});
module.exports = __toCommonJS(list_users_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  page_size: import_zod.z.number().int().min(1).max(100).optional().describe("Number of users per page, between 1 and 100."),
  cursor: import_zod.z.string().optional().describe("Pagination cursor from a previous response's next_cursor field.")
});

var OutputSchema = import_zod.z.object({
  object: import_zod.z.string().describe("Always 'list' for user list results."),
  results: import_zod.z.array(import_zod.z.any()).describe("Array of Notion user objects (people and bots) in the workspace."),
  has_more: import_zod.z.boolean().describe("Whether there are more users available beyond this page."),
  next_cursor: import_zod.z.string().nullable().describe("Cursor to pass in the next request for pagination, or null if no more results.")
});

var action = {
  type: "action",
  description: "List all users (people and bots) in the Notion workspace with pagination.",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/notion/list-users", group: "Users" },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const params = {};
    if (input.page_size) {
      params.page_size = input.page_size;
    }
    if (input.cursor) {
      params.start_cursor = input.cursor;
    }
    const response = await nango.get({
      endpoint: "v1/users",
      params,
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
      object: data.object,
      results: data.results,
      has_more: data.has_more,
      next_cursor: data.next_cursor || null
    };
  }
};

var list_users_default = action;
