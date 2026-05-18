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

// slack/actions/get-conversation-history.ts
var get_conversation_history_exports = {};
__export(get_conversation_history_exports, {
  default: () => get_conversation_history_default
});
module.exports = __toCommonJS(get_conversation_history_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe('The conversation ID to fetch history for. Example: "C1234567890"'),
  cursor: import_zod.z.string().optional().describe("Pagination cursor from previous response. Omit for first page."),
  oldest: import_zod.z.string().optional().describe('Only messages after this Unix timestamp will be included. Example: "1512085950.000216"'),
  latest: import_zod.z.string().optional().describe('Only messages before this Unix timestamp will be included. Example: "1512104434.000490"'),
  inclusive: import_zod.z.boolean().optional().describe("Include messages with oldest or latest timestamps in results. Defaults to false."),
  limit: import_zod.z.number().optional().describe("Maximum number of messages to return (max 999). Defaults to 100.")
});
var MessageSchema = import_zod.z.object({
  type: import_zod.z.string(),
  ts: import_zod.z.string(),
  user: import_zod.z.string().optional(),
  text: import_zod.z.string().optional(),
  thread_ts: import_zod.z.string().optional(),
  reply_count: import_zod.z.number().optional(),
  reactions: import_zod.z.array(import_zod.z.object({
    name: import_zod.z.string(),
    count: import_zod.z.number(),
    users: import_zod.z.array(import_zod.z.string())
  })).optional(),
  attachments: import_zod.z.array(import_zod.z.unknown()).optional()
});
var OutputSchema = import_zod.z.object({
  messages: import_zod.z.array(MessageSchema),
  has_more: import_zod.z.boolean(),
  next_cursor: import_zod.z.string().optional(),
  pin_count: import_zod.z.number().optional()
});
var ConversationHistoryResponseSchema = import_zod.z.object({
  ok: import_zod.z.boolean(),
  error: import_zod.z.string().optional(),
  messages: import_zod.z.array(MessageSchema).optional(),
  has_more: import_zod.z.boolean().optional(),
  response_metadata: import_zod.z.object({
    next_cursor: import_zod.z.string().optional()
  }).optional(),
  pin_count: import_zod.z.number().optional()
});
var action = {
  type: "action",
  description: "Fetch paginated message history for a conversation within optional time bounds",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/get-conversation-history",
    group: "Conversations"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:history", "groups:history", "im:history", "mpim:history"],
  exec: async (nango, input) => {
    const response = await nango.get({
      endpoint: "/conversations.history",
      params: {
        channel: input.channel_id,
        ...input.cursor && {
          cursor: input.cursor
        },
        ...input.oldest && {
          oldest: input.oldest
        },
        ...input.latest && {
          latest: input.latest
        },
        ...input.inclusive !== void 0 && {
          inclusive: input.inclusive.toString()
        },
        limit: input.limit ?? 100
      },
      retries: 3
    });
    const data = ConversationHistoryResponseSchema.parse(response.data);
    if (!data.ok) {
      throw new nango.ActionError({
        type: "slack_error",
        message: data.error || "Unknown Slack API error",
        channel_id: input.channel_id
      });
    }
    return {
      messages: data.messages || [],
      has_more: data.has_more || false,
      next_cursor: data.response_metadata?.next_cursor || void 0,
      pin_count: data.pin_count
    };
  }
};
var get_conversation_history_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9nZXQtY29udmVyc2F0aW9uLWhpc3RvcnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNoYW5uZWxfaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBjb252ZXJzYXRpb24gSUQgdG8gZmV0Y2ggaGlzdG9yeSBmb3IuIEV4YW1wbGU6IFwiQzEyMzQ1Njc4OTBcIicpLFxuICBjdXJzb3I6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFnaW5hdGlvbiBjdXJzb3IgZnJvbSBwcmV2aW91cyByZXNwb25zZS4gT21pdCBmb3IgZmlyc3QgcGFnZS4nKSxcbiAgb2xkZXN0OiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09ubHkgbWVzc2FnZXMgYWZ0ZXIgdGhpcyBVbml4IHRpbWVzdGFtcCB3aWxsIGJlIGluY2x1ZGVkLiBFeGFtcGxlOiBcIjE1MTIwODU5NTAuMDAwMjE2XCInKSxcbiAgbGF0ZXN0OiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ09ubHkgbWVzc2FnZXMgYmVmb3JlIHRoaXMgVW5peCB0aW1lc3RhbXAgd2lsbCBiZSBpbmNsdWRlZC4gRXhhbXBsZTogXCIxNTEyMTA0NDM0LjAwMDQ5MFwiJyksXG4gIGluY2x1c2l2ZTogei5ib29sZWFuKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnSW5jbHVkZSBtZXNzYWdlcyB3aXRoIG9sZGVzdCBvciBsYXRlc3QgdGltZXN0YW1wcyBpbiByZXN1bHRzLiBEZWZhdWx0cyB0byBmYWxzZS4nKSxcbiAgbGltaXQ6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTWF4aW11bSBudW1iZXIgb2YgbWVzc2FnZXMgdG8gcmV0dXJuIChtYXggOTk5KS4gRGVmYXVsdHMgdG8gMTAwLicpXG59KTtcbmNvbnN0IE1lc3NhZ2VTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGU6IHouc3RyaW5nKCksXG4gIHRzOiB6LnN0cmluZygpLFxuICB1c2VyOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHRleHQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgdGhyZWFkX3RzOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHJlcGx5X2NvdW50OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gIHJlYWN0aW9uczogei5hcnJheSh6Lm9iamVjdCh7XG4gICAgbmFtZTogei5zdHJpbmcoKSxcbiAgICBjb3VudDogei5udW1iZXIoKSxcbiAgICB1c2Vyczogei5hcnJheSh6LnN0cmluZygpKVxuICB9KSkub3B0aW9uYWwoKSxcbiAgYXR0YWNobWVudHM6IHouYXJyYXkoei51bmtub3duKCkpLm9wdGlvbmFsKClcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBtZXNzYWdlczogei5hcnJheShNZXNzYWdlU2NoZW1hKSxcbiAgaGFzX21vcmU6IHouYm9vbGVhbigpLFxuICBuZXh0X2N1cnNvcjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBwaW5fY291bnQ6IHoubnVtYmVyKCkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBDb252ZXJzYXRpb25IaXN0b3J5UmVzcG9uc2VTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIG9rOiB6LmJvb2xlYW4oKSxcbiAgZXJyb3I6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgbWVzc2FnZXM6IHouYXJyYXkoTWVzc2FnZVNjaGVtYSkub3B0aW9uYWwoKSxcbiAgaGFzX21vcmU6IHouYm9vbGVhbigpLm9wdGlvbmFsKCksXG4gIHJlc3BvbnNlX21ldGFkYXRhOiB6Lm9iamVjdCh7XG4gICAgbmV4dF9jdXJzb3I6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxuICB9KS5vcHRpb25hbCgpLFxuICBwaW5fY291bnQ6IHoubnVtYmVyKCkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnRmV0Y2ggcGFnaW5hdGVkIG1lc3NhZ2UgaGlzdG9yeSBmb3IgYSBjb252ZXJzYXRpb24gd2l0aGluIG9wdGlvbmFsIHRpbWUgYm91bmRzJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvZ2V0LWNvbnZlcnNhdGlvbi1oaXN0b3J5JyxcbiAgICBncm91cDogJ0NvbnZlcnNhdGlvbnMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydjaGFubmVsczpoaXN0b3J5JywgJ2dyb3VwczpoaXN0b3J5JywgJ2ltOmhpc3RvcnknLCAnbXBpbTpoaXN0b3J5J10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICAvLyBodHRwczovL2RvY3Muc2xhY2suZGV2L3JlZmVyZW5jZS9tZXRob2RzL2NvbnZlcnNhdGlvbnMuaGlzdG9yeVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0KHtcbiAgICAgIGVuZHBvaW50OiAnL2NvbnZlcnNhdGlvbnMuaGlzdG9yeScsXG4gICAgICBwYXJhbXM6IHtcbiAgICAgICAgY2hhbm5lbDogaW5wdXQuY2hhbm5lbF9pZCxcbiAgICAgICAgLi4uKGlucHV0LmN1cnNvciAmJiB7XG4gICAgICAgICAgY3Vyc29yOiBpbnB1dC5jdXJzb3JcbiAgICAgICAgfSksXG4gICAgICAgIC4uLihpbnB1dC5vbGRlc3QgJiYge1xuICAgICAgICAgIG9sZGVzdDogaW5wdXQub2xkZXN0XG4gICAgICAgIH0pLFxuICAgICAgICAuLi4oaW5wdXQubGF0ZXN0ICYmIHtcbiAgICAgICAgICBsYXRlc3Q6IGlucHV0LmxhdGVzdFxuICAgICAgICB9KSxcbiAgICAgICAgLi4uKGlucHV0LmluY2x1c2l2ZSAhPT0gdW5kZWZpbmVkICYmIHtcbiAgICAgICAgICBpbmNsdXNpdmU6IGlucHV0LmluY2x1c2l2ZS50b1N0cmluZygpXG4gICAgICAgIH0pLFxuICAgICAgICBsaW1pdDogaW5wdXQubGltaXQgPz8gMTAwXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIGNvbnN0IGRhdGEgPSBDb252ZXJzYXRpb25IaXN0b3J5UmVzcG9uc2VTY2hlbWEucGFyc2UocmVzcG9uc2UuZGF0YSk7XG4gICAgaWYgKCFkYXRhLm9rKSB7XG4gICAgICB0aHJvdyBuZXcgbmFuZ28uQWN0aW9uRXJyb3Ioe1xuICAgICAgICB0eXBlOiAnc2xhY2tfZXJyb3InLFxuICAgICAgICBtZXNzYWdlOiBkYXRhLmVycm9yIHx8ICdVbmtub3duIFNsYWNrIEFQSSBlcnJvcicsXG4gICAgICAgIGNoYW5uZWxfaWQ6IGlucHV0LmNoYW5uZWxfaWRcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgbWVzc2FnZXM6IGRhdGEubWVzc2FnZXMgfHwgW10sXG4gICAgICBoYXNfbW9yZTogZGF0YS5oYXNfbW9yZSB8fCBmYWxzZSxcbiAgICAgIG5leHRfY3Vyc29yOiBkYXRhLnJlc3BvbnNlX21ldGFkYXRhPy5uZXh0X2N1cnNvciB8fCB1bmRlZmluZWQsXG4gICAgICBwaW5fY291bnQ6IGRhdGEucGluX2NvdW50XG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFB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
