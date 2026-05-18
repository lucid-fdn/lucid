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

// slack/actions/post-message.ts
var post_message_exports = {};
__export(post_message_exports, {
  default: () => post_message_default
});
module.exports = __toCommonJS(post_message_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  channel: import_zod.z.string().describe('Channel, private group, or IM channel ID to send message to. Example: "C1234567890"'),
  text: import_zod.z.string().describe("Text of the message to send"),
  thread_ts: import_zod.z.string().optional().describe('Timestamp of parent message to reply in thread. Example: "1234567890.123456"')
});
var OutputSchema = import_zod.z.object({
  ok: import_zod.z.boolean().describe("Whether the API request succeeded"),
  channel: import_zod.z.string().describe("ID of the channel the message was sent to"),
  ts: import_zod.z.string().describe("Timestamp of the sent message"),
  message: import_zod.z.object({
    type: import_zod.z.string().describe("Message type"),
    subtype: import_zod.z.string().optional().describe("Message subtype"),
    text: import_zod.z.string().describe("Text of the message"),
    ts: import_zod.z.string().describe("Timestamp of the message"),
    username: import_zod.z.string().optional().describe("Username of the sender"),
    bot_id: import_zod.z.string().optional().describe("ID of the bot if sent by bot")
  }).describe("The message object that was sent")
});
var action = {
  type: "action",
  description: "Post a message to a channel, DM, or thread",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/post-message",
    group: "Messaging"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["chat:write"],
  exec: async (nango, input) => {
    const payload = {
      channel: input.channel,
      text: input.text
    };
    if (input.thread_ts) {
      payload.thread_ts = input.thread_ts;
    }
    const response = await nango.post({
      endpoint: "chat.postMessage",
      data: payload,
      retries: 3
    });
    if (!response.data.ok) {
      throw new nango.ActionError({
        type: "slack_api_error",
        message: response.data.error || "Unknown Slack API error",
        error: response.data.error
      });
    }
    return {
      ok: response.data.ok,
      channel: response.data.channel,
      ts: response.data.ts,
      message: {
        type: response.data.message.type,
        subtype: response.data.message.subtype || void 0,
        text: response.data.message.text,
        ts: response.data.message.ts,
        username: response.data.message.username || void 0,
        bot_id: response.data.message.bot_id || void 0
      }
    };
  }
};
var post_message_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9wb3N0LW1lc3NhZ2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNoYW5uZWw6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0NoYW5uZWwsIHByaXZhdGUgZ3JvdXAsIG9yIElNIGNoYW5uZWwgSUQgdG8gc2VuZCBtZXNzYWdlIHRvLiBFeGFtcGxlOiBcIkMxMjM0NTY3ODkwXCInKSxcbiAgdGV4dDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGV4dCBvZiB0aGUgbWVzc2FnZSB0byBzZW5kJyksXG4gIHRocmVhZF90czogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUaW1lc3RhbXAgb2YgcGFyZW50IG1lc3NhZ2UgdG8gcmVwbHkgaW4gdGhyZWFkLiBFeGFtcGxlOiBcIjEyMzQ1Njc4OTAuMTIzNDU2XCInKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIG9rOiB6LmJvb2xlYW4oKS5kZXNjcmliZSgnV2hldGhlciB0aGUgQVBJIHJlcXVlc3Qgc3VjY2VlZGVkJyksXG4gIGNoYW5uZWw6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0lEIG9mIHRoZSBjaGFubmVsIHRoZSBtZXNzYWdlIHdhcyBzZW50IHRvJyksXG4gIHRzOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaW1lc3RhbXAgb2YgdGhlIHNlbnQgbWVzc2FnZScpLFxuICBtZXNzYWdlOiB6Lm9iamVjdCh7XG4gICAgdHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnTWVzc2FnZSB0eXBlJyksXG4gICAgc3VidHlwZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdNZXNzYWdlIHN1YnR5cGUnKSxcbiAgICB0ZXh0OiB6LnN0cmluZygpLmRlc2NyaWJlKCdUZXh0IG9mIHRoZSBtZXNzYWdlJyksXG4gICAgdHM6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RpbWVzdGFtcCBvZiB0aGUgbWVzc2FnZScpLFxuICAgIHVzZXJuYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1VzZXJuYW1lIG9mIHRoZSBzZW5kZXInKSxcbiAgICBib3RfaWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnSUQgb2YgdGhlIGJvdCBpZiBzZW50IGJ5IGJvdCcpXG4gIH0pLmRlc2NyaWJlKCdUaGUgbWVzc2FnZSBvYmplY3QgdGhhdCB3YXMgc2VudCcpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdQb3N0IGEgbWVzc2FnZSB0byBhIGNoYW5uZWwsIERNLCBvciB0aHJlYWQnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9wb3N0LW1lc3NhZ2UnLFxuICAgIGdyb3VwOiAnTWVzc2FnaW5nJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnY2hhdDp3cml0ZSddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgY29uc3QgcGF5bG9hZDoge1xuICAgICAgY2hhbm5lbDogc3RyaW5nO1xuICAgICAgdGV4dDogc3RyaW5nO1xuICAgICAgdGhyZWFkX3RzPzogc3RyaW5nO1xuICAgIH0gPSB7XG4gICAgICBjaGFubmVsOiBpbnB1dC5jaGFubmVsLFxuICAgICAgdGV4dDogaW5wdXQudGV4dFxuICAgIH07XG4gICAgaWYgKGlucHV0LnRocmVhZF90cykge1xuICAgICAgcGF5bG9hZC50aHJlYWRfdHMgPSBpbnB1dC50aHJlYWRfdHM7XG4gICAgfVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucG9zdCh7XG4gICAgICBlbmRwb2ludDogJ2NoYXQucG9zdE1lc3NhZ2UnLFxuICAgICAgZGF0YTogcGF5bG9hZCxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBpZiAoIXJlc3BvbnNlLmRhdGEub2spIHtcbiAgICAgIHRocm93IG5ldyBuYW5nby5BY3Rpb25FcnJvcih7XG4gICAgICAgIHR5cGU6ICdzbGFja19hcGlfZXJyb3InLFxuICAgICAgICBtZXNzYWdlOiByZXNwb25zZS5kYXRhLmVycm9yIHx8ICdVbmtub3duIFNsYWNrIEFQSSBlcnJvcicsXG4gICAgICAgIGVycm9yOiByZXNwb25zZS5kYXRhLmVycm9yXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiByZXNwb25zZS5kYXRhLm9rLFxuICAgICAgY2hhbm5lbDogcmVzcG9uc2UuZGF0YS5jaGFubmVsLFxuICAgICAgdHM6IHJlc3BvbnNlLmRhdGEudHMsXG4gICAgICBtZXNzYWdlOiB7XG4gICAgICAgIHR5cGU6IHJlc3BvbnNlLmRhdGEubWVzc2FnZS50eXBlLFxuICAgICAgICBzdWJ0eXBlOiByZXNwb25zZS5kYXRhLm1lc3NhZ2Uuc3VidHlwZSB8fCB1bmRlZmluZWQsXG4gICAgICAgIHRleHQ6IHJlc3BvbnNlLmRhdGEubWVzc2FnZS50ZXh0LFxuICAgICAgICB0czogcmVzcG9uc2UuZGF0YS5tZXNzYWdlLnRzLFxuICAgICAgICB1c2VybmFtZTogcmVzcG9uc2UuZGF0YS5tZXNzYWdlLnVzZXJuYW1lIHx8IHVuZGVmaW5lZCxcbiAgICAgICAgYm90X2lkOiByZXNwb25zZS5kYXRhLm1lc3NhZ2UuYm90X2lkIHx8IHVuZGVmaW5lZFxuICAgICAgfVxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5l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
