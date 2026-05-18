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

// notion/actions/query-database.ts
var query_database_exports = {};
__export(query_database_exports, {
  default: () => query_database_default
});
module.exports = __toCommonJS(query_database_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  database_id: import_zod.z.string().describe("The ID of the database to query."),
  filter: import_zod.z.any().optional().describe("A Notion filter object to narrow results. Supports compound (and/or) and property-level filters."),
  sorts: import_zod.z.array(import_zod.z.any()).optional().describe("Array of sort objects. Each specifies a property name and direction ('ascending' or 'descending'), or a timestamp sort."),
  page_size: import_zod.z.number().int().min(1).max(100).optional().describe("Number of results per page, between 1 and 100."),
  cursor: import_zod.z.string().optional().describe("Pagination cursor from a previous response's next_cursor field.")
});

var OutputSchema = import_zod.z.object({
  object: import_zod.z.string().describe("Always 'list' for query results."),
  results: import_zod.z.array(import_zod.z.any()).describe("Array of Notion page objects matching the query filters."),
  has_more: import_zod.z.boolean().describe("Whether there are more results available beyond this page."),
  next_cursor: import_zod.z.string().nullable().describe("Cursor to pass in the next request for pagination, or null if no more results.")
});

var action = {
  type: "action",
  description: "Query a Notion database with optional filters, sorts, and pagination.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/notion/query-database", group: "Databases" },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const body = {};
    if (input.filter) {
      body.filter = input.filter;
    }
    if (input.sorts) {
      body.sorts = input.sorts;
    }
    if (input.page_size) {
      body.page_size = input.page_size;
    }
    if (input.cursor) {
      body.start_cursor = input.cursor;
    }
    const response = await nango.post({
      endpoint: `v1/databases/${input.database_id}/query`,
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
      object: data.object,
      results: data.results,
      has_more: data.has_more,
      next_cursor: data.next_cursor || null
    };
  }
};

var query_database_default = action;
