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

// slack/actions/pin-message.ts
var pin_message_exports = {};
__export(pin_message_exports, {
  default: () => pin_message_default
});
module.exports = __toCommonJS(pin_message_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe("The ID of the channel containing the message to pin"),
  message_ts: import_zod.z.string().describe("The timestamp of the message to pin to the channel")
});

var OutputSchema = import_zod.z.object({
  ok: import_zod.z.boolean().describe("Whether the message was successfully pinned")
});

var action = {
  type: "action",
  description: "Pin a message to a Slack channel so it appears in the channel's pinned items.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/slack/pin-message", group: "Slack Pins" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["pins:write"],
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "POST",
      endpoint: "pins.add",
      data: {
        channel: input.channel_id,
        timestamp: input.message_ts
      },
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to pin message",
        details: response.data
      });
    }

    return { ok: true };
  }
};

var pin_message_default = action;
