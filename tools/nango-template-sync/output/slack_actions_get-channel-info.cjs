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

// slack/actions/get-channel-info.ts
var get_channel_info_exports = {};
__export(get_channel_info_exports, {
  default: () => get_channel_info_default
});
module.exports = __toCommonJS(get_channel_info_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe("The unique channel ID to retrieve information for (e.g. C1234567890)")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("The unique identifier of the channel"),
  name: import_zod.z.string().describe("The name of the channel without the leading #"),
  topic: import_zod.z.string().describe("The current topic set for the channel"),
  purpose: import_zod.z.string().describe("The stated purpose of the channel"),
  num_members: import_zod.z.number().describe("The number of members currently in the channel"),
  is_private: import_zod.z.boolean().describe("Whether the channel is a private channel"),
  is_archived: import_zod.z.boolean().describe("Whether the channel has been archived"),
  created: import_zod.z.number().describe("Unix timestamp of when the channel was created"),
  creator: import_zod.z.string().describe("The user ID of the channel creator")
});

var action = {
  type: "action",
  description: "Get detailed information about a specific Slack channel by its channel ID.",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/slack/get-channel-info", group: "Slack Channels" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:read"],
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "GET",
      endpoint: "conversations.info",
      params: { channel: input.channel_id },
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to get channel info",
        details: response.data
      });
    }

    const ch = response.data.channel || {};
    return {
      id: ch.id || "",
      name: ch.name || "",
      topic: ch.topic?.value || "",
      purpose: ch.purpose?.value || "",
      num_members: ch.num_members || 0,
      is_private: ch.is_private || false,
      is_archived: ch.is_archived || false,
      created: ch.created || 0,
      creator: ch.creator || ""
    };
  }
};

var get_channel_info_default = action;
