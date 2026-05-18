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

// slack/actions/get-channel-history.ts
var get_channel_history_exports = {};
__export(get_channel_history_exports, {
  default: () => get_channel_history_default
});
module.exports = __toCommonJS(get_channel_history_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe("The channel ID to fetch message history from"),
  limit: import_zod.z.number().optional().describe("Maximum number of messages to return (default 100, max 1000)"),
  oldest: import_zod.z.string().optional().describe("Only messages after this Unix timestamp will be included"),
  latest: import_zod.z.string().optional().describe("Only messages before this Unix timestamp will be included"),
  cursor: import_zod.z.string().optional().describe("Pagination cursor returned from a previous request to fetch the next page")
});

var OutputSchema = import_zod.z.object({
  messages: import_zod.z.array(import_zod.z.object({
    type: import_zod.z.string().describe("The message type, typically 'message'"),
    user: import_zod.z.string().optional().describe("The user ID of the message sender"),
    text: import_zod.z.string().describe("The text content of the message"),
    ts: import_zod.z.string().describe("The timestamp identifier of the message"),
    thread_ts: import_zod.z.string().optional().describe("The thread parent timestamp if this message is in a thread"),
    reply_count: import_zod.z.number().describe("Number of replies in the thread (0 if not a thread parent)"),
    reactions: import_zod.z.array(import_zod.z.object({
      name: import_zod.z.string().describe("The emoji name of the reaction"),
      count: import_zod.z.number().describe("Number of users who added this reaction"),
      users: import_zod.z.array(import_zod.z.string()).describe("User IDs who reacted with this emoji")
    })).describe("List of reactions on this message")
  })).describe("List of messages in reverse chronological order"),
  has_more: import_zod.z.boolean().describe("Whether there are more messages available beyond this page"),
  next_cursor: import_zod.z.string().optional().describe("Cursor for fetching the next page of results")
});

var action = {
  type: "action",
  description: "Fetch message history from a Slack channel with optional time range filtering and pagination.",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/slack/get-channel-history", group: "Slack Messages" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:history"],
  exec: async (nango, input) => {
    const params = { channel: input.channel_id };
    if (input.limit) params.limit = input.limit;
    if (input.oldest) params.oldest = input.oldest;
    if (input.latest) params.latest = input.latest;
    if (input.cursor) params.cursor = input.cursor;

    const response = await nango.proxy({
      method: "GET",
      endpoint: "conversations.history",
      params,
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to get channel history",
        details: response.data
      });
    }

    const messages = (response.data.messages || []).map((msg) => ({
      type: msg.type || "message",
      user: msg.user || undefined,
      text: msg.text || "",
      ts: msg.ts || "",
      thread_ts: msg.thread_ts || undefined,
      reply_count: msg.reply_count || 0,
      reactions: (msg.reactions || []).map((r) => ({
        name: r.name || "",
        count: r.count || 0,
        users: r.users || []
      }))
    }));

    return {
      messages,
      has_more: response.data.has_more || false,
      next_cursor: response.data.response_metadata?.next_cursor || undefined
    };
  }
};

var get_channel_history_default = action;
