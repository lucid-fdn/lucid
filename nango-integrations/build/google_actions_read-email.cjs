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
  messageId: import_zod.z.string().describe("The ID of the Gmail message to read")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  threadId: import_zod.z.string(),
  from: import_zod.z.string().optional(),
  to: import_zod.z.string().optional(),
  cc: import_zod.z.string().optional(),
  subject: import_zod.z.string().optional(),
  date: import_zod.z.string().optional(),
  body: import_zod.z.string().optional(),
  snippet: import_zod.z.string().optional(),
  labelIds: import_zod.z.array(import_zod.z.string()).optional(),
  attachments: import_zod.z.array(import_zod.z.object({
    filename: import_zod.z.string(),
    mimeType: import_zod.z.string(),
    attachmentId: import_zod.z.string(),
    size: import_zod.z.number().optional()
  })).optional()
}).passthrough();

function decodeBase64Url(str) {
  if (!str) return "";
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function extractBody(payload) {
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    // Prefer text/plain, fallback to text/html
    const textPart = payload.parts.find(p => p.mimeType === "text/plain");
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
    const htmlPart = payload.parts.find(p => p.mimeType === "text/html");
    if (htmlPart?.body?.data) return decodeBase64Url(htmlPart.body.data);
    // Recurse into multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  return "";
}

function extractAttachments(payload) {
  const attachments = [];
  function walk(parts) {
    for (const part of (parts || [])) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          attachmentId: part.body.attachmentId,
          size: part.body.size
        });
      }
      if (part.parts) walk(part.parts);
    }
  }
  walk(payload.parts);
  return attachments;
}

var action = {
  type: "action",
  description: "Read a specific Gmail message including body, headers, and attachment metadata",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/actions/read-email", group: "Gmail" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  exec: async (nango, input) => {
    const resp = await nango.get({
      endpoint: `/gmail/v1/users/me/messages/${input.messageId}`,
      params: { format: "full" },
      retries: 3
    });
    const msg = resp.data;
    const headers = msg.payload?.headers || [];
    const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value;
    return {
      id: msg.id,
      threadId: msg.threadId,
      from: getHeader("From"),
      to: getHeader("To"),
      cc: getHeader("Cc"),
      subject: getHeader("Subject"),
      date: getHeader("Date"),
      body: extractBody(msg.payload),
      snippet: msg.snippet,
      labelIds: msg.labelIds,
      attachments: extractAttachments(msg.payload)
    };
  }
};
