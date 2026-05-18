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

// slack/actions/search-messages.ts
var search_messages_exports = {};
__export(search_messages_exports, {
  default: () => search_messages_default
});
module.exports = __toCommonJS(search_messages_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  query: import_zod.z.string().describe("The search query text to find matching messages"),
  sort: import_zod.z.enum(["score", "timestamp"]).optional().describe("Sort order for results: 'score' for relevance or 'timestamp' for recency"),
  sort_dir: import_zod.z.enum(["asc", "desc"]).optional().describe("Sort direction: 'asc' for ascending or 'desc' for descending"),
  count: import_zod.z.number().optional().describe("Number of results to return per page (default 20, max 100)"),
  page: import_zod.z.number().optional().describe("Page number for pagination (1-indexed)")
});

var OutputSchema = import_zod.z.object({
  messages: import_zod.z.array(import_zod.z.object({
    text: import_zod.z.string().describe("The message text content"),
    user: import_zod.z.string().describe("The user ID of the message sender"),
    ts: import_zod.z.string().describe("The timestamp of the message"),
    channel_id: import_zod.z.string().describe("The ID of the channel containing the message"),
    channel_name: import_zod.z.string().describe("The name of the channel containing the message"),
    permalink: import_zod.z.string().describe("A permanent URL link to the message")
  })).describe("List of messages matching the search query"),
  total: import_zod.z.number().describe("Total number of messages matching the query"),
  page: import_zod.z.number().describe("The current page number"),
  pages: import_zod.z.number().describe("Total number of pages available")
});

var action = {
  type: "action",
  description: "Search for messages in Slack matching a query string with sorting and pagination support.",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/slack/search-messages", group: "Slack Messages" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["search:read"],
  exec: async (nango, input) => {
    // search.messages requires a user token (xoxp-), not a bot token (xoxb-)
    // We call Slack API directly because nango.proxy() would override the Authorization
    // header with the Nango secret key, causing auth failure.
    const conn = await nango.getConnection();
    const userToken = conn?.credentials?.raw?.authed_user?.access_token;
    if (!userToken) {
      throw new nango.ActionError({
        message: "search-messages requires a user token (xoxp-). Reinstall the Slack app with the search:read user scope.",
        details: { hint: "OAuth & Permissions → User Token Scopes → add search:read → Reinstall to Workspace" }
      });
    }

    const params = new URLSearchParams({ query: input.query });
    if (input.sort) params.set("sort", input.sort);
    if (input.sort_dir) params.set("sort_dir", input.sort_dir);
    if (input.count) params.set("count", String(input.count));
    if (input.page) params.set("page", String(input.page));

    const resp = await fetch(`https://slack.com/api/search.messages?${params}`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const data = await resp.json();

    if (!data?.ok) {
      throw new nango.ActionError({
        message: data?.error || "Failed to search messages",
        details: data
      });
    }

    const matchData = data.messages || {};
    const matches = (matchData.matches || []).map((m) => ({
      text: m.text || "",
      user: m.user || "",
      ts: m.ts || "",
      channel_id: m.channel?.id || "",
      channel_name: m.channel?.name || "",
      permalink: m.permalink || ""
    }));

    return {
      messages: matches,
      total: matchData.total || 0,
      page: matchData.pagination?.page || 1,
      pages: matchData.pagination?.page_count || 1
    };
  }
};

var search_messages_default = action;
