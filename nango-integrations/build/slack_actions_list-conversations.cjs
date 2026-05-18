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

// slack/actions/list-conversations.ts
var list_conversations_exports = {};
__export(list_conversations_exports, {
  default: () => list_conversations_default
});
module.exports = __toCommonJS(list_conversations_exports);
var import_zod = require("zod");
var ConversationSchema = import_zod.z.object({
  id: import_zod.z.string(),
  name: import_zod.z.string(),
  created: import_zod.z.number(),
  creator: import_zod.z.string(),
  is_archived: import_zod.z.boolean(),
  is_general: import_zod.z.boolean(),
  is_private: import_zod.z.boolean(),
  is_mpim: import_zod.z.boolean(),
  is_im: import_zod.z.boolean(),
  num_members: import_zod.z.number().optional()
});
var InputSchema = import_zod.z.object({
  types: import_zod.z.string().optional().describe("Comma-separated list of conversation types to filter by. Options: public_channel, private_channel, mpim, im. Default: public_channel."),
  cursor: import_zod.z.string().optional().describe("Pagination cursor from previous response. Omit for first page."),
  limit: import_zod.z.number().optional().describe("Maximum number of conversations to return (1-200). Default: 100.")
});
var OutputSchema = import_zod.z.object({
  conversations: import_zod.z.array(ConversationSchema),
  next_cursor: import_zod.z.string().optional(),
  total: import_zod.z.number()
});
var action = {
  type: "action",
  description: "List Slack conversations with optional type filters and cursor pagination.",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/actions/list-conversations",
    group: "Conversations"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:read", "groups:read", "im:read", "mpim:read"],
  exec: async (nango, input) => {
    const config = {
      // https://api.slack.com/methods/conversations.list
      endpoint: "conversations.list",
      params: {
        types: input.types || "public_channel",
        limit: input.limit || 100,
        ...input.cursor && {
          cursor: input.cursor
        }
      },
      retries: 3
    };
    const response = await nango.get(config);
    const channels = response.data.channels || [];
    const responseMetadata = response.data.response_metadata || {};
    const nextCursor = responseMetadata.next_cursor || void 0;
    const conversations = channels.map((channel) => ({
      id: channel.id,
      name: channel.name || "",
      created: channel.created || 0,
      creator: channel.creator || "",
      is_archived: channel.is_archived || false,
      is_general: channel.is_general || false,
      is_private: channel.is_private || false,
      is_mpim: channel.is_mpim || false,
      is_im: channel.is_im || false,
      num_members: channel.num_members
    }));
    return {
      conversations,
      next_cursor: nextCursor,
      total: conversations.length
    };
  }
};
var list_conversations_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9saXN0LWNvbnZlcnNhdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgQ29udmVyc2F0aW9uU2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgbmFtZTogei5zdHJpbmcoKSxcbiAgY3JlYXRlZDogei5udW1iZXIoKSxcbiAgY3JlYXRvcjogei5zdHJpbmcoKSxcbiAgaXNfYXJjaGl2ZWQ6IHouYm9vbGVhbigpLFxuICBpc19nZW5lcmFsOiB6LmJvb2xlYW4oKSxcbiAgaXNfcHJpdmF0ZTogei5ib29sZWFuKCksXG4gIGlzX21waW06IHouYm9vbGVhbigpLFxuICBpc19pbTogei5ib29sZWFuKCksXG4gIG51bV9tZW1iZXJzOiB6Lm51bWJlcigpLm9wdGlvbmFsKClcbn0pO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGVzOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NvbW1hLXNlcGFyYXRlZCBsaXN0IG9mIGNvbnZlcnNhdGlvbiB0eXBlcyB0byBmaWx0ZXIgYnkuIE9wdGlvbnM6IHB1YmxpY19jaGFubmVsLCBwcml2YXRlX2NoYW5uZWwsIG1waW0sIGltLiBEZWZhdWx0OiBwdWJsaWNfY2hhbm5lbC4nKSxcbiAgY3Vyc29yOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhZ2luYXRpb24gY3Vyc29yIGZyb20gcHJldmlvdXMgcmVzcG9uc2UuIE9taXQgZm9yIGZpcnN0IHBhZ2UuJyksXG4gIGxpbWl0OiB6Lm51bWJlcigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ01heGltdW0gbnVtYmVyIG9mIGNvbnZlcnNhdGlvbnMgdG8gcmV0dXJuICgxLTIwMCkuIERlZmF1bHQ6IDEwMC4nKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNvbnZlcnNhdGlvbnM6IHouYXJyYXkoQ29udmVyc2F0aW9uU2NoZW1hKSxcbiAgbmV4dF9jdXJzb3I6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgdG90YWw6IHoubnVtYmVyKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0xpc3QgU2xhY2sgY29udmVyc2F0aW9ucyB3aXRoIG9wdGlvbmFsIHR5cGUgZmlsdGVycyBhbmQgY3Vyc29yIHBhZ2luYXRpb24uJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9saXN0LWNvbnZlcnNhdGlvbnMnLFxuICAgIGdyb3VwOiAnQ29udmVyc2F0aW9ucydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2NoYW5uZWxzOnJlYWQnLCAnZ3JvdXBzOnJlYWQnLCAnaW06cmVhZCcsICdtcGltOnJlYWQnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIGNvbnN0IGNvbmZpZyA9IHtcbiAgICAgIC8vIGh0dHBzOi8vYXBpLnNsYWNrLmNvbS9tZXRob2RzL2NvbnZlcnNhdGlvbnMubGlzdFxuICAgICAgZW5kcG9pbnQ6ICdjb252ZXJzYXRpb25zLmxpc3QnLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIHR5cGVzOiBpbnB1dC50eXBlcyB8fCAncHVibGljX2NoYW5uZWwnLFxuICAgICAgICBsaW1pdDogaW5wdXQubGltaXQgfHwgMTAwLFxuICAgICAgICAuLi4oaW5wdXQuY3Vyc29yICYmIHtcbiAgICAgICAgICBjdXJzb3I6IGlucHV0LmN1cnNvclxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9O1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0KGNvbmZpZyk7XG4gICAgY29uc3QgY2hhbm5lbHMgPSByZXNwb25zZS5kYXRhLmNoYW5uZWxzIHx8IFtdO1xuICAgIGNvbnN0IHJlc3BvbnNlTWV0YWRhdGEgPSByZXNwb25zZS5kYXRhLnJlc3BvbnNlX21ldGFkYXRhIHx8IHt9O1xuICAgIGNvbnN0IG5leHRDdXJzb3IgPSByZXNwb25zZU1ldGFkYXRhLm5leHRfY3Vyc29yIHx8IHVuZGVmaW5lZDtcbiAgICBjb25zdCBjb252ZXJzYXRpb25zID0gY2hhbm5lbHMubWFwKChjaGFubmVsOiBhbnkpID0+ICh7XG4gICAgICBpZDogY2hhbm5lbC5pZCxcbiAgICAgIG5hbWU6IGNoYW5uZWwubmFtZSB8fCAnJyxcbiAgICAgIGNyZWF0ZWQ6IGNoYW5uZWwuY3JlYXRlZCB8fCAwLFxuICAgICAgY3JlYXRvcjogY2hhbm5lbC5jcmVhdG9yIHx8ICcnLFxuICAgICAgaXNfYXJjaGl2ZWQ6IGNoYW5uZWwuaXNfYXJjaGl2ZWQgfHwgZmFsc2UsXG4gICAgICBpc19nZW5lcmFsOiBjaGFubmVsLmlzX2dlbmVyYWwgfHwgZmFsc2UsXG4gICAgICBpc19wcml2YXRlOiBjaGFubmVsLmlzX3ByaXZhdGUgfHwgZmFsc2UsXG4gICAgICBpc19tcGltOiBjaGFubmVsLmlzX21waW0gfHwgZmFsc2UsXG4gICAgICBpc19pbTogY2hhbm5lbC5pc19pbSB8fCBmYWxzZSxcbiAgICAgIG51bV9tZW1iZXJzOiBjaGFubmVsLm51bV9tZW1iZXJzXG4gICAgfSkpO1xuICAgIHJldHVybiB7XG4gICAgICBjb252ZXJzYXRpb25zLFxuICAgICAgbmV4dF9jdXJzb3I6IG5leHRDdXJzb3IsXG4gICAgICB0b3RhbDogY29udmVyc2F0aW9ucy5sZW5ndGhcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5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
