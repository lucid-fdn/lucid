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
  query: import_zod.z.string().describe('Gmail search query (same syntax as Gmail search bar). Example: "from:alice subject:invoice after:2024/01/01"'),
  maxResults: import_zod.z.number().optional().describe("Max messages to return (default 10). Example: 5"),
  pageToken: import_zod.z.string().optional().describe("Token for pagination")
});

var OutputSchema = import_zod.z.object({
  messages: import_zod.z.array(import_zod.z.object({
    id: import_zod.z.string(),
    threadId: import_zod.z.string(),
    snippet: import_zod.z.string().optional(),
    from: import_zod.z.string().optional(),
    subject: import_zod.z.string().optional(),
    date: import_zod.z.string().optional()
  })),
  total: import_zod.z.number(),
  nextPageToken: import_zod.z.string().optional()
}).passthrough();

var action = {
  type: "action",
  description: "Search Gmail messages using Gmail search syntax",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/actions/search-emails", group: "Gmail" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  exec: async (nango, input) => {
    const maxResults = input.maxResults || 10;
    const listResp = await nango.get({
      endpoint: "/gmail/v1/users/me/messages",
      params: {
        q: input.query,
        maxResults: String(maxResults),
        ...(input.pageToken && { pageToken: input.pageToken })
      },
      retries: 3
    });
    const messageIds = listResp.data.messages || [];
    const messages = [];
    for (const msg of messageIds.slice(0, maxResults)) {
      const detail = await nango.get({
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
        subject: getHeader("Subject"),
        date: getHeader("Date")
      });
    }
    return {
      messages,
      total: listResp.data.resultSizeEstimate || messages.length,
      nextPageToken: listResp.data.nextPageToken
    };
  }
};
