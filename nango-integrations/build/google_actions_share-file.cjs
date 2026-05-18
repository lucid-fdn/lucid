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
  fileId: import_zod.z.string().describe("The ID of the file to share"),
  email: import_zod.z.string().describe("Email of the person to share with"),
  role: import_zod.z.enum(["reader", "writer", "commenter"]).describe('Permission role. Example: "writer"'),
  sendNotification: import_zod.z.boolean().optional().describe("Whether to send an email notification (default true)")
});

var OutputSchema = import_zod.z.object({
  permissionId: import_zod.z.string(),
  role: import_zod.z.string(),
  type: import_zod.z.string(),
  emailAddress: import_zod.z.string().optional()
}).passthrough();

var action = {
  type: "action",
  description: "Share a Google Drive file or folder with a specific person",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/actions/share-file", group: "Drive" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/drive"],
  exec: async (nango, input) => {
    const resp = await nango.post({
      endpoint: `/drive/v3/files/${input.fileId}/permissions`,
      params: {
        sendNotificationEmail: String(input.sendNotification !== false)
      },
      data: {
        type: "user",
        role: input.role,
        emailAddress: input.email
      },
      retries: 3
    });
    return {
      permissionId: resp.data.id,
      role: resp.data.role,
      type: resp.data.type,
      emailAddress: input.email
    };
  }
};
