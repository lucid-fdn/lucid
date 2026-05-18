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

// slack/actions/list-channels.ts
var list_channels_exports = {};
__export(list_channels_exports, {
  default: () => list_channels_default
});
module.exports = __toCommonJS(list_channels_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  types: import_zod.z.string().optional().describe("Comma-separated channel types to include: public_channel, private_channel, mpim, im"),
  exclude_archived: import_zod.z.boolean().optional().describe("Set to true to exclude archived channels from the results"),
  limit: import_zod.z.number().optional().describe("Maximum number of channels to return per page (default 100, max 1000)"),
  cursor: import_zod.z.string().optional().describe("Pagination cursor returned from a previous request to fetch the next page of results")
});

var OutputSchema = import_zod.z.object({
  channels: import_zod.z.array(import_zod.z.object({
    id: import_zod.z.string().describe("The unique identifier of the channel"),
    name: import_zod.z.string().describe("The name of the channel without the leading #"),
    topic: import_zod.z.string().describe("The current topic set for the channel"),
    purpose: import_zod.z.string().describe("The stated purpose of the channel"),
    num_members: import_zod.z.number().describe("The number of members currently in the channel"),
    is_private: import_zod.z.boolean().describe("Whether the channel is a private channel"),
    is_archived: import_zod.z.boolean().describe("Whether the channel has been archived")
  })).describe("List of channels matching the filter criteria"),
  next_cursor: import_zod.z.string().optional().describe("Cursor for fetching the next page of results; empty string if no more pages")
});

var action = {
  type: "action",
  description: "List Slack channels in the workspace with optional filtering by type, archive status, and pagination support.",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/slack/list-channels", group: "Slack Channels" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:read", "groups:read"],
  exec: async (nango, input) => {
    const params = {};
    if (input.types) params.types = input.types;
    if (input.exclude_archived !== undefined) params.exclude_archived = input.exclude_archived;
    if (input.limit) params.limit = input.limit;
    if (input.cursor) params.cursor = input.cursor;

    const response = await nango.proxy({
      method: "GET",
      endpoint: "conversations.list",
      params,
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to list channels",
        details: response.data
      });
    }

    const channels = (response.data.channels || []).map((ch) => ({
      id: ch.id,
      name: ch.name,
      topic: ch.topic?.value || "",
      purpose: ch.purpose?.value || "",
      num_members: ch.num_members || 0,
      is_private: ch.is_private || false,
      is_archived: ch.is_archived || false
    }));

    return {
      channels,
      next_cursor: response.data.response_metadata?.next_cursor || undefined
    };
  }
};

var list_channels_default = action;
