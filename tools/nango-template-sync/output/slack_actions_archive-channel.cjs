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

// slack/actions/archive-channel.ts
var archive_channel_exports = {};
__export(archive_channel_exports, {
  default: () => archive_channel_default
});
module.exports = __toCommonJS(archive_channel_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe("The ID of the channel to archive (e.g. C1234567890)")
});

var OutputSchema = import_zod.z.object({
  ok: import_zod.z.boolean().describe("Whether the channel was successfully archived")
});

var action = {
  type: "action",
  description: "Archive a Slack channel, making it read-only and hidden from the default channel list.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/slack/archive-channel", group: "Slack Channels" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:manage"],
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "POST",
      endpoint: "conversations.archive",
      data: { channel: input.channel_id },
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to archive channel",
        details: response.data
      });
    }

    return { ok: true };
  }
};

var archive_channel_default = action;
