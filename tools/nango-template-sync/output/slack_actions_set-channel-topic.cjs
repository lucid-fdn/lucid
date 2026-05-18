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

// slack/actions/set-channel-topic.ts
var set_channel_topic_exports = {};
__export(set_channel_topic_exports, {
  default: () => set_channel_topic_default
});
module.exports = __toCommonJS(set_channel_topic_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe("The ID of the channel to update the topic for (e.g. C1234567890)"),
  topic: import_zod.z.string().describe("The new topic text to set for the channel (max 250 chars)")
});

var OutputSchema = import_zod.z.object({
  topic: import_zod.z.string().describe("The updated topic value that was set on the channel")
});

var action = {
  type: "action",
  description: "Set or update the topic of a Slack channel.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/slack/set-channel-topic", group: "Slack Channels" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:write"],
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "POST",
      endpoint: "conversations.setTopic",
      data: { channel: input.channel_id, topic: input.topic },
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to set channel topic",
        details: response.data
      });
    }

    return {
      topic: response.data.topic?.value || response.data.topic || input.topic
    };
  }
};

var set_channel_topic_default = action;
