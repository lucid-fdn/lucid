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

// slack/actions/update-message.ts
var update_message_exports = {};
__export(update_message_exports, {
  default: () => update_message_default
});
module.exports = __toCommonJS(update_message_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe('The ID of the channel containing the message to update. Example: "C1234567890"'),
  message_ts: import_zod.z.string().describe('The timestamp of the message to update. Example: "1401383885.000061"'),
  text: import_zod.z.string().describe('The updated text of the message. Example: "Updated message text"'),
  as_user: import_zod.z.boolean().optional().describe("Pass true to update the message as the authenticated user. Bot users in this context are considered authed users. Default: true"),
  link_names: import_zod.z.boolean().optional().describe('Find and link channel names and usernames. Defaults to false. To use this, you need parse set to "full".'),
  parse: import_zod.z.enum(["none", "full", "client"]).optional().describe('Change how messages are treated. Defaults to "client" which attempts to discover links. Use "none" to treat text literally, "full" for full parsing with link_names.'),
  unfurl_links: import_zod.z.boolean().optional().describe("Pass false to disable unfurling of links."),
  unfurl_media: import_zod.z.boolean().optional().describe("Pass false to disable unfurling of media content."),
  reply_broadcast: import_zod.z.boolean().optional().describe("Used to reply to a thread only and not to the channel. Pass true to reply to the channel as well."),
  blocks: import_zod.z.array(import_zod.z.object({}).passthrough()).optional().describe("A JSON array of blocks to use as the message content. When blocks is provided, text becomes the fallback text for notifications."),
  attachments: import_zod.z.array(import_zod.z.object({}).passthrough()).optional().describe("A JSON array of legacy attachments. Not recommended for new apps, use blocks instead.")
});
var OutputSchema = import_zod.z.object({
  ok: import_zod.z.boolean().describe("Whether the API call was successful"),
  channel: import_zod.z.string().describe("The ID of the channel where the message was updated"),
  ts: import_zod.z.string().describe("The timestamp of the updated message"),
  text: import_zod.z.string().describe("The updated text of the message"),
  message: import_zod.z.any().optional().describe("Full message object containing updated message details")
});
var action = {
  type: "action",
  description: "Edit an existing message in a Slack channel",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/update-message",
    group: "Messages"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["chat:write"],
  exec: async (nango, input) => {
    const response = await nango.post({
      endpoint: "/chat.update",
      data: {
        channel: input.channel_id,
        ts: input.message_ts,
        text: input.text,
        as_user: input.as_user ?? true,
        ...input.link_names !== void 0 && {
          link_names: input.link_names ? 1 : 0
        },
        ...input.parse && {
          parse: input.parse
        },
        ...input.unfurl_links !== void 0 && {
          unfurl_links: input.unfurl_links
        },
        ...input.unfurl_media !== void 0 && {
          unfurl_media: input.unfurl_media
        },
        ...input.reply_broadcast !== void 0 && {
          reply_broadcast: input.reply_broadcast
        },
        ...input.blocks && {
          blocks: input.blocks
        },
        ...input.attachments && {
          attachments: input.attachments
        }
      },
      retries: 3
    });
    if (!response.data.ok) {
      throw new nango.ActionError({
        type: "slack_api_error",
        message: response.data.error || "Unknown Slack API error",
        channel_id: input.channel_id,
        message_ts: input.message_ts
      });
    }
    return {
      ok: response.data.ok,
      channel: response.data.channel,
      ts: response.data.ts,
      text: response.data.text || input.text,
      message: response.data.message
    };
  }
};
var update_message_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy91cGRhdGUtbWVzc2FnZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgY2hhbm5lbF9pZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIElEIG9mIHRoZSBjaGFubmVsIGNvbnRhaW5pbmcgdGhlIG1lc3NhZ2UgdG8gdXBkYXRlLiBFeGFtcGxlOiBcIkMxMjM0NTY3ODkwXCInKSxcbiAgbWVzc2FnZV90czogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIHRpbWVzdGFtcCBvZiB0aGUgbWVzc2FnZSB0byB1cGRhdGUuIEV4YW1wbGU6IFwiMTQwMTM4Mzg4NS4wMDAwNjFcIicpLFxuICB0ZXh0OiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgdXBkYXRlZCB0ZXh0IG9mIHRoZSBtZXNzYWdlLiBFeGFtcGxlOiBcIlVwZGF0ZWQgbWVzc2FnZSB0ZXh0XCInKSxcbiAgYXNfdXNlcjogei5ib29sZWFuKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFzcyB0cnVlIHRvIHVwZGF0ZSB0aGUgbWVzc2FnZSBhcyB0aGUgYXV0aGVudGljYXRlZCB1c2VyLiBCb3QgdXNlcnMgaW4gdGhpcyBjb250ZXh0IGFyZSBjb25zaWRlcmVkIGF1dGhlZCB1c2Vycy4gRGVmYXVsdDogdHJ1ZScpLFxuICBsaW5rX25hbWVzOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGaW5kIGFuZCBsaW5rIGNoYW5uZWwgbmFtZXMgYW5kIHVzZXJuYW1lcy4gRGVmYXVsdHMgdG8gZmFsc2UuIFRvIHVzZSB0aGlzLCB5b3UgbmVlZCBwYXJzZSBzZXQgdG8gXCJmdWxsXCIuJyksXG4gIHBhcnNlOiB6LmVudW0oWydub25lJywgJ2Z1bGwnLCAnY2xpZW50J10pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NoYW5nZSBob3cgbWVzc2FnZXMgYXJlIHRyZWF0ZWQuIERlZmF1bHRzIHRvIFwiY2xpZW50XCIgd2hpY2ggYXR0ZW1wdHMgdG8gZGlzY292ZXIgbGlua3MuIFVzZSBcIm5vbmVcIiB0byB0cmVhdCB0ZXh0IGxpdGVyYWxseSwgXCJmdWxsXCIgZm9yIGZ1bGwgcGFyc2luZyB3aXRoIGxpbmtfbmFtZXMuJyksXG4gIHVuZnVybF9saW5rczogei5ib29sZWFuKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFzcyBmYWxzZSB0byBkaXNhYmxlIHVuZnVybGluZyBvZiBsaW5rcy4nKSxcbiAgdW5mdXJsX21lZGlhOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQYXNzIGZhbHNlIHRvIGRpc2FibGUgdW5mdXJsaW5nIG9mIG1lZGlhIGNvbnRlbnQuJyksXG4gIHJlcGx5X2Jyb2FkY2FzdDogei5ib29sZWFuKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVXNlZCB0byByZXBseSB0byBhIHRocmVhZCBvbmx5IGFuZCBub3QgdG8gdGhlIGNoYW5uZWwuIFBhc3MgdHJ1ZSB0byByZXBseSB0byB0aGUgY2hhbm5lbCBhcyB3ZWxsLicpLFxuICBibG9ja3M6IHouYXJyYXkoei5vYmplY3Qoe30pLnBhc3N0aHJvdWdoKCkpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0EgSlNPTiBhcnJheSBvZiBibG9ja3MgdG8gdXNlIGFzIHRoZSBtZXNzYWdlIGNvbnRlbnQuIFdoZW4gYmxvY2tzIGlzIHByb3ZpZGVkLCB0ZXh0IGJlY29tZXMgdGhlIGZhbGxiYWNrIHRleHQgZm9yIG5vdGlmaWNhdGlvbnMuJyksXG4gIGF0dGFjaG1lbnRzOiB6LmFycmF5KHoub2JqZWN0KHt9KS5wYXNzdGhyb3VnaCgpKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdBIEpTT04gYXJyYXkgb2YgbGVnYWN5IGF0dGFjaG1lbnRzLiBOb3QgcmVjb21tZW5kZWQgZm9yIG5ldyBhcHBzLCB1c2UgYmxvY2tzIGluc3RlYWQuJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBvazogei5ib29sZWFuKCkuZGVzY3JpYmUoJ1doZXRoZXIgdGhlIEFQSSBjYWxsIHdhcyBzdWNjZXNzZnVsJyksXG4gIGNoYW5uZWw6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgY2hhbm5lbCB3aGVyZSB0aGUgbWVzc2FnZSB3YXMgdXBkYXRlZCcpLFxuICB0czogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIHRpbWVzdGFtcCBvZiB0aGUgdXBkYXRlZCBtZXNzYWdlJyksXG4gIHRleHQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSB1cGRhdGVkIHRleHQgb2YgdGhlIG1lc3NhZ2UnKSxcbiAgbWVzc2FnZTogei5hbnkoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGdWxsIG1lc3NhZ2Ugb2JqZWN0IGNvbnRhaW5pbmcgdXBkYXRlZCBtZXNzYWdlIGRldGFpbHMnKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnRWRpdCBhbiBleGlzdGluZyBtZXNzYWdlIGluIGEgU2xhY2sgY2hhbm5lbCcsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL3VwZGF0ZS1tZXNzYWdlJyxcbiAgICBncm91cDogJ01lc3NhZ2VzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnY2hhdDp3cml0ZSddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgLy8gaHR0cHM6Ly9hcGkuc2xhY2suY29tL21ldGhvZHMvY2hhdC51cGRhdGVcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnBvc3Qoe1xuICAgICAgZW5kcG9pbnQ6ICcvY2hhdC51cGRhdGUnLFxuICAgICAgZGF0YToge1xuICAgICAgICBjaGFubmVsOiBpbnB1dC5jaGFubmVsX2lkLFxuICAgICAgICB0czogaW5wdXQubWVzc2FnZV90cyxcbiAgICAgICAgdGV4dDogaW5wdXQudGV4dCxcbiAgICAgICAgYXNfdXNlcjogaW5wdXQuYXNfdXNlciA/PyB0cnVlLFxuICAgICAgICAuLi4oaW5wdXQubGlua19uYW1lcyAhPT0gdW5kZWZpbmVkICYmIHtcbiAgICAgICAgICBsaW5rX25hbWVzOiBpbnB1dC5saW5rX25hbWVzID8gMSA6IDBcbiAgICAgICAgfSksXG4gICAgICAgIC4uLihpbnB1dC5wYXJzZSAmJiB7XG4gICAgICAgICAgcGFyc2U6IGlucHV0LnBhcnNlXG4gICAgICAgIH0pLFxuICAgICAgICAuLi4oaW5wdXQudW5mdXJsX2xpbmtzICE9PSB1bmRlZmluZWQgJiYge1xuICAgICAgICAgIHVuZnVybF9saW5rczogaW5wdXQudW5mdXJsX2xpbmtzXG4gICAgICAgIH0pLFxuICAgICAgICAuLi4oaW5wdXQudW5mdXJsX21lZGlhICE9PSB1bmRlZmluZWQgJiYge1xuICAgICAgICAgIHVuZnVybF9tZWRpYTogaW5wdXQudW5mdXJsX21lZGlhXG4gICAgICAgIH0pLFxuICAgICAgICAuLi4oaW5wdXQucmVwbHlfYnJvYWRjYXN0ICE9PSB1bmRlZmluZWQgJiYge1xuICAgICAgICAgIHJlcGx5X2Jyb2FkY2FzdDogaW5wdXQucmVwbHlfYnJvYWRjYXN0XG4gICAgICAgIH0pLFxuICAgICAgICAuLi4oaW5wdXQuYmxvY2tzICYmIHtcbiAgICAgICAgICBibG9ja3M6IGlucHV0LmJsb2Nrc1xuICAgICAgICB9KSxcbiAgICAgICAgLi4uKGlucHV0LmF0dGFjaG1lbnRzICYmIHtcbiAgICAgICAgICBhdHRhY2htZW50czogaW5wdXQuYXR0YWNobWVudHNcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgaWYgKCFyZXNwb25zZS5kYXRhLm9rKSB7XG4gICAgICB0aHJvdyBuZXcgbmFuZ28uQWN0aW9uRXJyb3Ioe1xuICAgICAgICB0eXBlOiAnc2xhY2tfYXBpX2Vycm9yJyxcbiAgICAgICAgbWVzc2FnZTogcmVzcG9uc2UuZGF0YS5lcnJvciB8fCAnVW5rbm93biBTbGFjayBBUEkgZXJyb3InLFxuICAgICAgICBjaGFubmVsX2lkOiBpbnB1dC5jaGFubmVsX2lkLFxuICAgICAgICBtZXNzYWdlX3RzOiBpbnB1dC5tZXNzYWdlX3RzXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiByZXNwb25zZS5kYXRhLm9rLFxuICAgICAgY2hhbm5lbDogcmVzcG9uc2UuZGF0YS5jaGFubmVsLFxuICAgICAgdHM6IHJlc3BvbnNlLmRhdGEudHMsXG4gICAgICB0ZXh0OiByZXNwb25zZS5kYXRhLnRleHQgfHwgaW5wdXQudGV4dCxcbiAgICAgIG1lc3NhZ2U6IHJlc3BvbnNlLmRhdGEubWVzc2FnZVxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixZQUFZLGFBQUUsT0FBTyxFQUFFLFNBQVMsZ0ZBQWdGO0FBQUEsRUFDaEgsWUFBWSxhQUFFLE9BQU8sRUFBRSxTQUFTLHNFQUFzRTtBQUFBLEVBQ3RHLE1BQU0sYUFBRSxPQUFPLEVBQUUsU0FBUyxrRUFBa0U7QUFBQSxFQUM1RixTQUFTLGFBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxTQUFTLGlJQUFpSTtBQUFBLEVBQzFLLFlBQVksYUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFNB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
