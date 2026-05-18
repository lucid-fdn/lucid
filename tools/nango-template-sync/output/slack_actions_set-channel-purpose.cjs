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

// slack/actions/set-channel-purpose.ts
var set_channel_purpose_exports = {};
__export(set_channel_purpose_exports, {
  default: () => set_channel_purpose_default
});
module.exports = __toCommonJS(set_channel_purpose_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe("The ID of the channel to update the purpose for (e.g. C1234567890)"),
  purpose: import_zod.z.string().describe("The new purpose text to set for the channel (max 250 chars)")
});

var OutputSchema = import_zod.z.object({
  purpose: import_zod.z.string().describe("The updated purpose value that was set on the channel")
});

var action = {
  type: "action",
  description: "Set or update the purpose of a Slack channel.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/slack/set-channel-purpose", group: "Slack Channels" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:write"],
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "POST",
      endpoint: "conversations.setPurpose",
      data: { channel: input.channel_id, purpose: input.purpose },
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to set channel purpose",
        details: response.data
      });
    }

    return {
      purpose: response.data.purpose?.value || response.data.purpose || input.purpose
    };
  }
};

var set_channel_purpose_default = action;
