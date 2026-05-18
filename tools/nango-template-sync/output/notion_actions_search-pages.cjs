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

// notion/actions/search-pages.ts
var search_pages_exports = {};
__export(search_pages_exports, {
  default: () => search_pages_default
});
module.exports = __toCommonJS(search_pages_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  query: import_zod.z.string().optional().describe("The search query string. When empty, returns all pages in the workspace."),
  page_size: import_zod.z.number().int().min(1).max(100).optional().describe("Number of results per page, between 1 and 100."),
  cursor: import_zod.z.string().optional().describe("Pagination cursor from a previous response's next_cursor field.")
});

var OutputSchema = import_zod.z.object({
  object: import_zod.z.string().describe("Always 'list' for search results."),
  results: import_zod.z.array(import_zod.z.any()).describe("Array of Notion page objects matching the search query."),
  has_more: import_zod.z.boolean().describe("Whether there are more results available beyond this page."),
  next_cursor: import_zod.z.string().nullable().describe("Cursor to pass in the next request for pagination, or null if no more results.")
});

var action = {
  type: "action",
  description: "Search for pages in the Notion workspace. Filters results to only return page objects.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/notion/search-pages", group: "Search" },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const body = {
      filter: {
        property: "object",
        value: "page"
      }
    };
    if (input.query) {
      body.query = input.query;
    }
    if (input.page_size) {
      body.page_size = input.page_size;
    }
    if (input.cursor) {
      body.start_cursor = input.cursor;
    }
    const response = await nango.post({
      endpoint: "v1/search",
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

var search_pages_default = action;
