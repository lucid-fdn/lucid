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

// slack/actions/mark-as-read.ts
var mark_as_read_exports = {};
__export(mark_as_read_exports, {
  default: () => mark_as_read_default
});
module.exports = __toCommonJS(mark_as_read_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe('The channel ID to mark as read. Example: "C02MB5ZABA7"'),
  message_ts: import_zod.z.string().describe('Timestamp of the message to mark as read. Example: "1234567890.123456"')
});
var OutputSchema = import_zod.z.object({
  ok: import_zod.z.boolean().describe("Whether the operation succeeded")
});
var action = {
  type: "action",
  description: "Move a conversation's read cursor to a specific message timestamp",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/mark-as-read",
    group: "Conversations"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:read"],
  exec: async (nango, input) => {
    const config = {
      // https://api.slack.com/methods/conversations.mark
      endpoint: "conversations.mark",
      data: {
        channel: input.channel_id,
        ts: input.message_ts
      },
      retries: 3
    };
    const response = await nango.post(config);
    if (!response.data.ok) {
      throw new nango.ActionError({
        type: "slack_error",
        message: response.data.error || "Failed to mark conversation as read",
        channel_id: input.channel_id,
        message_ts: input.message_ts
      });
    }
    return {
      ok: response.data.ok
    };
  }
};
var mark_as_read_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9tYXJrLWFzLXJlYWQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNoYW5uZWxfaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBjaGFubmVsIElEIHRvIG1hcmsgYXMgcmVhZC4gRXhhbXBsZTogXCJDMDJNQjVaQUJBN1wiJyksXG4gIG1lc3NhZ2VfdHM6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RpbWVzdGFtcCBvZiB0aGUgbWVzc2FnZSB0byBtYXJrIGFzIHJlYWQuIEV4YW1wbGU6IFwiMTIzNDU2Nzg5MC4xMjM0NTZcIicpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgb2s6IHouYm9vbGVhbigpLmRlc2NyaWJlKCdXaGV0aGVyIHRoZSBvcGVyYXRpb24gc3VjY2VlZGVkJylcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogXCJNb3ZlIGEgY29udmVyc2F0aW9uJ3MgcmVhZCBjdXJzb3IgdG8gYSBzcGVjaWZpYyBtZXNzYWdlIHRpbWVzdGFtcFwiLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9tYXJrLWFzLXJlYWQnLFxuICAgIGdyb3VwOiAnQ29udmVyc2F0aW9ucydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2NoYW5uZWxzOnJlYWQnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIGNvbnN0IGNvbmZpZyA9IHtcbiAgICAgIC8vIGh0dHBzOi8vYXBpLnNsYWNrLmNvbS9tZXRob2RzL2NvbnZlcnNhdGlvbnMubWFya1xuICAgICAgZW5kcG9pbnQ6ICdjb252ZXJzYXRpb25zLm1hcmsnLFxuICAgICAgZGF0YToge1xuICAgICAgICBjaGFubmVsOiBpbnB1dC5jaGFubmVsX2lkLFxuICAgICAgICB0czogaW5wdXQubWVzc2FnZV90c1xuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9O1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucG9zdChjb25maWcpO1xuICAgIGlmICghcmVzcG9uc2UuZGF0YS5vaykge1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ3NsYWNrX2Vycm9yJyxcbiAgICAgICAgbWVzc2FnZTogcmVzcG9uc2UuZGF0YS5lcnJvciB8fCAnRmFpbGVkIHRvIG1hcmsgY29udmVyc2F0aW9uIGFzIHJlYWQnLFxuICAgICAgICBjaGFubmVsX2lkOiBpbnB1dC5jaGFubmVsX2lkLFxuICAgICAgICBtZXNzYWdlX3RzOiBpbnB1dC5tZXNzYWdlX3RzXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiByZXNwb25zZS5kYXRhLm9rXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLFlBQVksYUFBRSxPQUFPLEVBQUUsU0FBUyx3REFBd0Q7QUFBQSxFQUN4RixZQUFZLGFBQUUsT0FBTyxFQUFFLFNBQVMsd0VBQXdFO0FBQzFHLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsSUFBSSxhQUFFLFFBQVEsRUFBRSxTQUFTLGlDQUFpQztBQUM1RCxDQUFDO0FBQ0QsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsUUFBUSxDQUFDLGVBQWU7QUFBQSxFQUN4QixNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUNuRSxVQUFNLFNBQVM7QUFBQTtBQUFBLE1BRWIsVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLFFBQ0osU0FBUyxNQUFNO0FBQUEsUUFDZixJQUFJLE1BQU07QUFBQSxNQUNaO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWDtBQUNBLFVBQU0sV0FBVyxNQUFNLE1BQU0sS0FBSyxNQUFNO0FBQ3hDLFFBQUksQ0FBQyxTQUFTLEtBQUssSUFBSTtBQUNyQixZQUFNLElBQUksTUFBTSxZQUFZO0FBQUEsUUFDMUIsTUFBTTtBQUFBLFFBQ04sU0FBUyxTQUFTLEtBQUssU0FBUztBQUFBLFFBQ2hDLFlBQVksTUFBTTtBQUFBLFFBQ2xCLFlBQVksTUFBTTtBQUFBLE1BQ3BCLENBQUM7QUFBQSxJQUNIO0FBQ0EsV0FBTztBQUFBLE1BQ0wsSUFBSSxTQUFTLEtBQUs7QUFBQSxJQUNwQjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sdUJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
