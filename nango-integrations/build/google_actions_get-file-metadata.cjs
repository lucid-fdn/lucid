"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => { for (var name in all) __defProp(target, name, { get: all[name], enumerable: true }); };
var __copyProps = (to, from, except, desc) => { if (from && typeof from === "object" || typeof from === "function") { for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable }); } return to; };
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var exports_mod = {};
__export(exports_mod, { default: () => action });
module.exports = __toCommonJS(exports_mod);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  fileId: import_zod.z.string().describe("The ID of the file")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  name: import_zod.z.string(),
  mimeType: import_zod.z.string(),
  size: import_zod.z.string().optional(),
  createdTime: import_zod.z.string().optional(),
  modifiedTime: import_zod.z.string().optional(),
  owners: import_zod.z.array(import_zod.z.object({ displayName: import_zod.z.string().optional(), emailAddress: import_zod.z.string().optional() })).optional(),
  webViewLink: import_zod.z.string().optional(),
  webContentLink: import_zod.z.string().optional(),
  shared: import_zod.z.boolean().optional(),
  permissions: import_zod.z.array(import_zod.z.any()).optional()
}).passthrough();

var action = {
  type: "action",
  description: "Get detailed metadata and permissions for a Google Drive file",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/actions/get-file-metadata", group: "Drive" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/drive"],
  exec: async (nango, input) => {
    const resp = await nango.get({
      endpoint: `/drive/v3/files/${input.fileId}`,
      params: {
        fields: "id,name,mimeType,size,createdTime,modifiedTime,owners,webViewLink,webContentLink,shared,permissions(id,role,type,emailAddress,displayName)"
      },
      retries: 3
    });
    return resp.data;
  }
};
