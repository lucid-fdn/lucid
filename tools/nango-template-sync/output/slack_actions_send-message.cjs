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

// slack/actions/send-message.ts
var send_message_exports = {};
__export(send_message_exports, {
  default: () => send_message_default
});
module.exports = __toCommonJS(send_message_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe("The ID of the channel, DM, or group to send the message to"),
  text: import_zod.z.string().describe("The message text content to send (supports Slack mrkdwn formatting)"),
  thread_ts: import_zod.z.string().optional().describe("Timestamp of the parent message to reply in a thread"),
  unfurl_links: import_zod.z.boolean().optional().describe("Set to true to enable unfurling of primarily text-based content"),
  unfurl_media: import_zod.z.boolean().optional().describe("Set to false to disable unfurling of media content")
});

var OutputSchema = import_zod.z.object({
  ts: import_zod.z.string().describe("The timestamp identifier of the sent message"),
  channel: import_zod.z.string().describe("The channel ID where the message was posted"),
  message: import_zod.z.object({
    text: import_zod.z.string().describe("The text content of the sent message"),
    user: import_zod.z.string().describe("The user ID of the message sender (bot)"),
    ts: import_zod.z.string().describe("The timestamp of the sent message"),
    type: import_zod.z.string().describe("The message type, typically 'message'")
  }).describe("The full message object as returned by Slack")
});

var action = {
  type: "action",
  description: "Send a message to a Slack channel, DM, or thread with support for formatting and link unfurling.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/slack/send-message", group: "Slack Messages" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["chat:write"],
  exec: async (nango, input) => {
    const body = {
      channel: input.channel_id,
      text: input.text
    };
    if (input.thread_ts) body.thread_ts = input.thread_ts;
    if (input.unfurl_links !== undefined) body.unfurl_links = input.unfurl_links;
    if (input.unfurl_media !== undefined) body.unfurl_media = input.unfurl_media;

    const response = await nango.proxy({
      method: "POST",
      endpoint: "chat.postMessage",
      data: body,
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to send message",
        details: response.data
      });
    }

    const msg = response.data.message || {};
    return {
      ts: response.data.ts || "",
      channel: response.data.channel || "",
      message: {
        text: msg.text || "",
        user: msg.user || "",
        ts: msg.ts || "",
        type: msg.type || "message"
      }
    };
  }
};

var send_message_default = action;
