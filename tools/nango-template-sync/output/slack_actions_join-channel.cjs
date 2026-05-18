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

// slack/actions/join-channel.ts
var join_channel_exports = {};
__export(join_channel_exports, {
  default: () => join_channel_default
});
module.exports = __toCommonJS(join_channel_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe("The ID of the public channel to join (e.g. C1234567890)")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("The unique identifier of the joined channel"),
  name: import_zod.z.string().describe("The name of the joined channel"),
  is_member: import_zod.z.boolean().describe("Whether the authenticated user is now a member of the channel")
});

var action = {
  type: "action",
  description: "Join a public Slack channel on behalf of the authenticated user.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/slack/join-channel", group: "Slack Channels" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:join"],
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "POST",
      endpoint: "conversations.join",
      data: { channel: input.channel_id },
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to join channel",
        details: response.data
      });
    }

    const ch = response.data.channel || {};
    return {
      id: ch.id || "",
      name: ch.name || "",
      is_member: ch.is_member || true
    };
  }
};

var join_channel_default = action;
