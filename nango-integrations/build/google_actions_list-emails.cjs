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
  maxResults: import_zod.z.number().optional().describe("Max messages to return (default 20). Example: 10"),
  labelIds: import_zod.z.array(import_zod.z.string()).optional().describe('Filter by label IDs. Example: ["INBOX", "UNREAD"]'),
  query: import_zod.z.string().optional().describe('Gmail search query. Example: "from:boss@company.com is:unread"'),
  pageToken: import_zod.z.string().optional().describe("Token for pagination")
});

var OutputSchema = import_zod.z.object({
  messages: import_zod.z.array(import_zod.z.object({
    id: import_zod.z.string(),
    threadId: import_zod.z.string(),
    snippet: import_zod.z.string().optional(),
    from: import_zod.z.string().optional(),
    to: import_zod.z.string().optional(),
    subject: import_zod.z.string().optional(),
    date: import_zod.z.string().optional(),
    labelIds: import_zod.z.array(import_zod.z.string()).optional()
  })),
  nextPageToken: import_zod.z.string().optional(),
  resultSizeEstimate: import_zod.z.number().optional()
}).passthrough();

var action = {
  type: "action",
  description: "List Gmail messages with optional filtering by label or search query",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/actions/list-emails", group: "Gmail" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  exec: async (nango, input) => {
    const params = {
      maxResults: String(input.maxResults || 20),
      ...(input.query && { q: input.query }),
      ...(input.pageToken && { pageToken: input.pageToken })
    };
    if (input.labelIds) {
      for (const l of input.labelIds) params["labelIds"] = l;
    }
    const listResp = await nango.proxy({
      method: "GET",
      endpoint: "/gmail/v1/users/me/messages",
      params,
      retries: 3
    });
    const messageIds = listResp.data.messages || [];
    const messages = [];
    for (const msg of messageIds.slice(0, input.maxResults || 20)) {
      const detail = await nango.proxy({
        method: "GET",
        endpoint: `/gmail/v1/users/me/messages/${msg.id}?format=full`,
        retries: 2
      });
      const headers = detail.data.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value;
      messages.push({
        id: detail.data.id,
        threadId: detail.data.threadId,
        snippet: detail.data.snippet,
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        labelIds: detail.data.labelIds
      });
    }
    return {
      messages,
      nextPageToken: listResp.data.nextPageToken,
      resultSizeEstimate: listResp.data.resultSizeEstimate
    };
  }
};
