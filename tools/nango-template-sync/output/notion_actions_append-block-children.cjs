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

// notion/actions/append-block-children.ts
var append_block_children_exports = {};
__export(append_block_children_exports, {
  default: () => append_block_children_default
});
module.exports = __toCommonJS(append_block_children_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  block_id: import_zod.z.string().describe("The ID of the block (or page) to append children to. Use a page ID to add content to a page."),
  children: import_zod.z.array(import_zod.z.any()).describe("Array of block objects to append. Supports paragraph, heading, bulleted_list_item, numbered_list_item, to_do, toggle, code, quote, callout, divider, table_of_contents, and more.")
});

var OutputSchema = import_zod.z.object({
  object: import_zod.z.string().describe("Always 'list' for the appended blocks result."),
  results: import_zod.z.array(import_zod.z.any()).describe("Array of the newly created block objects that were appended.")
});

var action = {
  type: "action",
  description: "Append child blocks to a Notion block or page. Use this to add content like paragraphs, headings, lists, and more.",
  version: "1.0.0",
  endpoint: { method: "PATCH", path: "/notion/append-block-children", group: "Blocks" },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const response = await nango.patch({
      endpoint: `v1/blocks/${input.block_id}/children`,
      data: { children: input.children },
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
      results: data.results
    };
  }
};

var append_block_children_default = action;
