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

// notion/actions/delete-block.ts
var delete_block_exports = {};
__export(delete_block_exports, {
  default: () => delete_block_default
});
module.exports = __toCommonJS(delete_block_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  block_id: import_zod.z.string().describe("The ID of the block to delete (archive). This sets the block's archived status to true.")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("Unique identifier of the deleted block."),
  object: import_zod.z.string().describe("Always 'block' for block objects."),
  archived: import_zod.z.boolean().describe("Whether the block is archived. Will be true after deletion.")
});

var action = {
  type: "action",
  description: "Delete (archive) a Notion block by its ID.",
  version: "1.0.0",
  endpoint: { method: "DELETE", path: "/notion/delete-block", group: "Blocks" },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const response = await nango.delete({
      endpoint: `v1/blocks/${input.block_id}`,
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
      archived: true
    };
  }
};

var delete_block_default = action;
