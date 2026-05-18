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

// slack/actions/leave-channel.ts
var leave_channel_exports = {};
__export(leave_channel_exports, {
  default: () => leave_channel_default
});
module.exports = __toCommonJS(leave_channel_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe("The ID of the channel to leave (e.g. C1234567890)")
});

var OutputSchema = import_zod.z.object({
  ok: import_zod.z.boolean().describe("Whether the channel was successfully left")
});

var action = {
  type: "action",
  description: "Leave a Slack channel on behalf of the authenticated user.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/slack/leave-channel", group: "Slack Channels" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:write"],
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "POST",
      endpoint: "conversations.leave",
      data: { channel: input.channel_id },
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to leave channel",
        details: response.data
      });
    }

    return { ok: true };
  }
};

var leave_channel_default = action;
