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

// slack/actions/get-file-info.ts
var get_file_info_exports = {};
__export(get_file_info_exports, {
  default: () => get_file_info_default
});
module.exports = __toCommonJS(get_file_info_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  file_id: import_zod.z.string().describe("The unique file ID to retrieve information for (e.g. F1234567890)")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("The unique identifier of the file"),
  name: import_zod.z.string().describe("The filename of the file"),
  title: import_zod.z.string().describe("The display title of the file"),
  mimetype: import_zod.z.string().describe("The MIME type of the file"),
  filetype: import_zod.z.string().describe("The Slack file type identifier"),
  size: import_zod.z.number().describe("The file size in bytes"),
  user: import_zod.z.string().describe("The user ID of the file uploader"),
  created: import_zod.z.number().describe("Unix timestamp of when the file was created"),
  permalink: import_zod.z.string().describe("A permanent URL to access the file"),
  channels: import_zod.z.array(import_zod.z.string()).describe("List of channel IDs the file has been shared to")
});

var action = {
  type: "action",
  description: "Get detailed metadata about a specific file uploaded to Slack by its file ID.",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/slack/get-file-info", group: "Slack Files" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["files:read"],
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "GET",
      endpoint: "files.info",
      params: { file: input.file_id },
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to get file info",
        details: response.data
      });
    }

    const f = response.data.file || {};
    return {
      id: f.id || "",
      name: f.name || "",
      title: f.title || "",
      mimetype: f.mimetype || "",
      filetype: f.filetype || "",
      size: f.size || 0,
      user: f.user || "",
      created: f.created || 0,
      permalink: f.permalink || "",
      channels: f.channels || []
    };
  }
};

var get_file_info_default = action;
