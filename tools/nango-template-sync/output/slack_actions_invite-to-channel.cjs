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

// slack/actions/invite-to-channel.ts
var invite_to_channel_exports = {};
__export(invite_to_channel_exports, {
  default: () => invite_to_channel_default
});
module.exports = __toCommonJS(invite_to_channel_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe("The ID of the channel to invite users to (e.g. C1234567890)"),
  user_ids: import_zod.z.string().describe("Comma-separated list of user IDs to invite to the channel (e.g. 'U1234,U5678')")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("The unique identifier of the channel users were invited to"),
  name: import_zod.z.string().describe("The name of the channel users were invited to")
});

var action = {
  type: "action",
  description: "Invite one or more users to a Slack channel by their user IDs.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/slack/invite-to-channel", group: "Slack Channels" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:manage"],
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "POST",
      endpoint: "conversations.invite",
      data: {
        channel: input.channel_id,
        users: input.user_ids
      },
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to invite users to channel",
        details: response.data
      });
    }

    const ch = response.data.channel || {};
    return {
      id: ch.id || "",
      name: ch.name || ""
    };
  }
};

var invite_to_channel_default = action;
