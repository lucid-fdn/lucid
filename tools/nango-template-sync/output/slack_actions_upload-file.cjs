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

// slack/actions/upload-file.ts
var upload_file_exports = {};
__export(upload_file_exports, {
  default: () => upload_file_default
});
module.exports = __toCommonJS(upload_file_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  channels: import_zod.z.string().describe("Comma-separated list of channel IDs to share the file to"),
  content: import_zod.z.string().describe("The text content of the file to upload"),
  filename: import_zod.z.string().optional().describe("The filename including extension (e.g. 'report.txt')"),
  filetype: import_zod.z.string().optional().describe("The file type identifier (e.g. 'text', 'csv', 'javascript')"),
  title: import_zod.z.string().optional().describe("A descriptive title for the file"),
  initial_comment: import_zod.z.string().optional().describe("An optional message to include with the file upload"),
  thread_ts: import_zod.z.string().optional().describe("Timestamp of a parent message to upload the file as a thread reply")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("The unique identifier of the uploaded file"),
  name: import_zod.z.string().describe("The filename of the uploaded file"),
  title: import_zod.z.string().describe("The title of the uploaded file"),
  mimetype: import_zod.z.string().describe("The MIME type of the uploaded file"),
  filetype: import_zod.z.string().describe("The Slack file type identifier"),
  size: import_zod.z.number().describe("The file size in bytes"),
  permalink: import_zod.z.string().describe("A permanent URL to access the file")
});

var action = {
  type: "action",
  description: "Upload text content as a file to one or more Slack channels with optional threading support.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/slack/upload-file", group: "Slack Files" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["files:write"],
  exec: async (nango, input) => {
    const body = {
      channels: input.channels,
      content: input.content
    };
    if (input.filename) body.filename = input.filename;
    if (input.filetype) body.filetype = input.filetype;
    if (input.title) body.title = input.title;
    if (input.initial_comment) body.initial_comment = input.initial_comment;
    if (input.thread_ts) body.thread_ts = input.thread_ts;

    const response = await nango.proxy({
      method: "POST",
      endpoint: "files.upload",
      data: body,
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to upload file",
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
      permalink: f.permalink || ""
    };
  }
};

var upload_file_default = action;
