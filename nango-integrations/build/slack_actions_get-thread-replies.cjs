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

// slack/actions/get-thread-replies.ts
var get_thread_replies_exports = {};
__export(get_thread_replies_exports, {
  default: () => get_thread_replies_default
});
module.exports = __toCommonJS(get_thread_replies_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe('The ID of the channel/conversation containing the thread. Example: "C1234567890"'),
  thread_ts: import_zod.z.string().describe('The timestamp of the parent message in the thread. Example: "1234567890.123456"'),
  cursor: import_zod.z.string().optional().describe("Pagination cursor from previous response. Omit for first page."),
  limit: import_zod.z.number().min(1).max(100).optional().describe("Maximum number of messages to return per page. Default: 100.")
});
var MessageSchema = import_zod.z.object({
  type: import_zod.z.string(),
  user: import_zod.z.string().optional(),
  text: import_zod.z.string(),
  ts: import_zod.z.string(),
  thread_ts: import_zod.z.string().optional(),
  reply_count: import_zod.z.number().optional(),
  reply_users_count: import_zod.z.number().optional(),
  reply_users: import_zod.z.array(import_zod.z.string()).optional()
});
var OutputSchema = import_zod.z.object({
  messages: import_zod.z.array(MessageSchema).describe("Array of messages in the thread, including parent and replies"),
  next_cursor: import_zod.z.string().optional().describe("Pagination cursor for next page. Omitted if no more pages."),
  has_more: import_zod.z.boolean().describe("Whether there are more messages to fetch")
});
var action = {
  type: "action",
  description: "Fetch paginated thread replies and parent message for a conversation thread",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/actions/get-thread-replies",
    group: "Messages"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:history", "groups:history", "im:history", "mpim:history"],
  exec: async (nango, input) => {
    const response = await nango.get({
      endpoint: "conversations.replies",
      params: {
        channel: input.channel_id,
        ts: input.thread_ts,
        ...input.cursor && {
          cursor: input.cursor
        },
        ...input.limit && {
          limit: String(input.limit)
        }
      },
      retries: 3
    });
    if (!response.data || response.data.ok === false) {
      throw new nango.ActionError({
        type: "slack_api_error",
        message: response.data?.error || "Failed to fetch thread replies",
        channel_id: input.channel_id,
        thread_ts: input.thread_ts
      });
    }
    const messages = (response.data.messages || []).map((msg) => ({
      type: msg.type || "message",
      user: msg.user || void 0,
      text: msg.text || "",
      ts: msg.ts,
      thread_ts: msg.thread_ts || void 0,
      reply_count: msg.reply_count,
      reply_users_count: msg.reply_users_count,
      reply_users: msg.reply_users
    }));
    return {
      messages,
      next_cursor: response.data.response_metadata?.next_cursor || void 0,
      has_more: response.data.has_more || false
    };
  }
};
var get_thread_replies_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9nZXQtdGhyZWFkLXJlcGxpZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNoYW5uZWxfaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgY2hhbm5lbC9jb252ZXJzYXRpb24gY29udGFpbmluZyB0aGUgdGhyZWFkLiBFeGFtcGxlOiBcIkMxMjM0NTY3ODkwXCInKSxcbiAgdGhyZWFkX3RzOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgdGltZXN0YW1wIG9mIHRoZSBwYXJlbnQgbWVzc2FnZSBpbiB0aGUgdGhyZWFkLiBFeGFtcGxlOiBcIjEyMzQ1Njc4OTAuMTIzNDU2XCInKSxcbiAgY3Vyc29yOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhZ2luYXRpb24gY3Vyc29yIGZyb20gcHJldmlvdXMgcmVzcG9uc2UuIE9taXQgZm9yIGZpcnN0IHBhZ2UuJyksXG4gIGxpbWl0OiB6Lm51bWJlcigpLm1pbigxKS5tYXgoMTAwKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdNYXhpbXVtIG51bWJlciBvZiBtZXNzYWdlcyB0byByZXR1cm4gcGVyIHBhZ2UuIERlZmF1bHQ6IDEwMC4nKVxufSk7XG5jb25zdCBNZXNzYWdlU2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LnN0cmluZygpLFxuICB1c2VyOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHRleHQ6IHouc3RyaW5nKCksXG4gIHRzOiB6LnN0cmluZygpLFxuICB0aHJlYWRfdHM6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgcmVwbHlfY291bnQ6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgcmVwbHlfdXNlcnNfY291bnQ6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgcmVwbHlfdXNlcnM6IHouYXJyYXkoei5zdHJpbmcoKSkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIG1lc3NhZ2VzOiB6LmFycmF5KE1lc3NhZ2VTY2hlbWEpLmRlc2NyaWJlKCdBcnJheSBvZiBtZXNzYWdlcyBpbiB0aGUgdGhyZWFkLCBpbmNsdWRpbmcgcGFyZW50IGFuZCByZXBsaWVzJyksXG4gIG5leHRfY3Vyc29yOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhZ2luYXRpb24gY3Vyc29yIGZvciBuZXh0IHBhZ2UuIE9taXR0ZWQgaWYgbm8gbW9yZSBwYWdlcy4nKSxcbiAgaGFzX21vcmU6IHouYm9vbGVhbigpLmRlc2NyaWJlKCdXaGV0aGVyIHRoZXJlIGFyZSBtb3JlIG1lc3NhZ2VzIHRvIGZldGNoJylcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0ZldGNoIHBhZ2luYXRlZCB0aHJlYWQgcmVwbGllcyBhbmQgcGFyZW50IG1lc3NhZ2UgZm9yIGEgY29udmVyc2F0aW9uIHRocmVhZCcsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnR0VUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvZ2V0LXRocmVhZC1yZXBsaWVzJyxcbiAgICBncm91cDogJ01lc3NhZ2VzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnY2hhbm5lbHM6aGlzdG9yeScsICdncm91cHM6aGlzdG9yeScsICdpbTpoaXN0b3J5JywgJ21waW06aGlzdG9yeSddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgLy8gaHR0cHM6Ly9hcGkuc2xhY2suY29tL21ldGhvZHMvY29udmVyc2F0aW9ucy5yZXBsaWVzXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5nZXQoe1xuICAgICAgZW5kcG9pbnQ6ICdjb252ZXJzYXRpb25zLnJlcGxpZXMnLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIGNoYW5uZWw6IGlucHV0LmNoYW5uZWxfaWQsXG4gICAgICAgIHRzOiBpbnB1dC50aHJlYWRfdHMsXG4gICAgICAgIC4uLihpbnB1dC5jdXJzb3IgJiYge1xuICAgICAgICAgIGN1cnNvcjogaW5wdXQuY3Vyc29yXG4gICAgICAgIH0pLFxuICAgICAgICAuLi4oaW5wdXQubGltaXQgJiYge1xuICAgICAgICAgIGxpbWl0OiBTdHJpbmcoaW5wdXQubGltaXQpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIGlmICghcmVzcG9uc2UuZGF0YSB8fCByZXNwb25zZS5kYXRhLm9rID09PSBmYWxzZSkge1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ3NsYWNrX2FwaV9lcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3BvbnNlLmRhdGE/LmVycm9yIHx8ICdGYWlsZWQgdG8gZmV0Y2ggdGhyZWFkIHJlcGxpZXMnLFxuICAgICAgICBjaGFubmVsX2lkOiBpbnB1dC5jaGFubmVsX2lkLFxuICAgICAgICB0aHJlYWRfdHM6IGlucHV0LnRocmVhZF90c1xuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IG1lc3NhZ2VzID0gKHJlc3BvbnNlLmRhdGEubWVzc2FnZXMgfHwgW10pLm1hcCgobXNnOiBhbnkpID0+ICh7XG4gICAgICB0eXBlOiBtc2cudHlwZSB8fCAnbWVzc2FnZScsXG4gICAgICB1c2VyOiBtc2cudXNlciB8fCB1bmRlZmluZWQsXG4gICAgICB0ZXh0OiBtc2cudGV4dCB8fCAnJyxcbiAgICAgIHRzOiBtc2cudHMsXG4gICAgICB0aHJlYWRfdHM6IG1zZy50aHJlYWRfdHMgfHwgdW5kZWZpbmVkLFxuICAgICAgcmVwbHlfY291bnQ6IG1zZy5yZXBseV9jb3VudCxcbiAgICAgIHJlcGx5X3VzZXJzX2NvdW50OiBtc2cucmVwbHlfdXNlcnNfY291bnQsXG4gICAgICByZXBseV91c2VyczogbXNnLnJlcGx5X3VzZXJzXG4gICAgfSkpO1xuICAgIHJldHVybiB7XG4gICAgICBtZXNzYWdlcyxcbiAgICAgIG5leHRfY3Vyc29yOiByZXNwb25zZS5kYXRhLnJlc3BvbnNlX21ldGFkYXRhPy5uZXh0X2N1cnNvciB8fCB1bmRlZmluZWQsXG4gICAgICBoYXNfbW9yZTogcmVzcG9uc2UuZGF0YS5oYXNfbW9yZSB8fCBmYWxzZVxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixZQUFZLGFBQUUsT0FBTyxFQUFFLFNBQVMsa0ZBQWtGO0FBQUEsRUFDbEgsV0FBVyxhQUFFLE9BQU8sRUFBRSxTQUFTLGlGQUFpRjtBQUFBLEVBQ2hILFFBQVEsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsZ0VBQWdFO0FBQUEsRUFDdkcsT0FBTyxhQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsRUFBRSxJQUFJLEdBQUcsRUFBRSxTQUFTLEVBQUUsU0FBUyw4REFBOEQ7QUFDdEgsQ0FBQztBQUNELElBQU0sZ0JBQWdCLGFBQUUsT0FBTztBQUFBLEVBQzdCLE1BQU0sYUFBRSxPQUFPO0FBQUEsRUFDZixNQUFNLGFBQUUsT0FBTyxFQUFFLFNBQVM7QUFBQSxFQUMxQixNQUFNLGFBQUUsT0FBTztBQUFBLEVBQ2YsSUFBSSxhQUFFLE9BQU87QUFBQSxFQUNiLFdBQVcsYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLEVBQy9CLGFBQWEsYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLEVBQ2pDLG1CQUFtQixhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDdkMsYUFBYSxhQUFFLE1BQU0sYUFBRSxPQUFPLENBQUMsRUFBRSxTQUFTO0FBQzVDLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsVUFBVSxhQUFFLE1BQU0sYUFBYSxFQUFFLFNBQVMsK0RBQStEO0FBQUEsRUFDekcsYUFBYSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyw0REFBNEQ7QUFBQSxFQUN4RyxVQUFVLGFBQUUsUUFBUSxFQUFFLFNBQVMsMENBQTBDO0FBQzNFLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUMsb0JBQW9CLGtCQUFrQixjQUFjLGNBQWM7QUFBQSxFQUMzRSxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUVuRSxVQUFNLFdBQVcsTUFBTSxNQUFNLElBQUk7QUFBQSxNQUMvQixVQUFVO0FBQUEsTUFDVixRQUFRO0FBQUEsUUFDTixTQUFTLE1BQU07QUFBQSxRQUNmLElBQUksTUFBTTtBQUFBLFFBQ1YsR0FBSSxNQUFNLFVBQVU7QUFBQSxVQUNsQixRQUFRLE1BQU07QUFBQSxRQUNoQjtBQUFBLFFBQ0EsR0FBSSxNQUFNLFNBQVM7QUFBQSxVQUNqQixPQUFPLE9BQU8sTUFBTSxLQUFLO0FBQUEsUUFDM0I7QUFBQSxNQUNGO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsUUFBSSxDQUFDLFNBQVMsUUFBUSxTQUFTLEtBQUssT0FBTyxPQUFPO0FBQ2hELFlBQU0sSUFBSSxNQUFNLFlBQVk7QUFBQSxRQUMxQixNQUFNO0FBQUEsUUFDTixTQUFTLFNBQVMsTUFBTSxTQUFTO0FBQUEsUUFDakMsWUFBWSxNQUFNO0FBQUEsUUFDbEIsV0FBVyxNQUFNO0FBQUEsTUFDbkIsQ0FBQztBQUFBLElBQ0g7QUFDQSxVQUFNLFlBQVksU0FBUyxLQUFLLFlBQVksQ0FBQyxHQUFHLElBQUksQ0FBQyxTQUFjO0FBQUEsTUFDakUsTUFBTSxJQUFJLFFBQVE7QUFBQSxNQUNsQixNQUFNLElBQUksUUFBUTtBQUFBLE1BQ2xCLE1BQU0sSUFBSSxRQUFRO0FBQUEsTUFDbEIsSUFBSSxJQUFJO0FBQUEsTUFDUixXQUFXLElBQUksYUFBYTtBQUFBLE1BQzVCLGFBQWEsSUFBSTtBQUFBLE1BQ2pCLG1CQUFtQixJQUFJO0FBQUEsTUFDdkIsYUFBYSxJQUFJO0FBQUEsSUFDbkIsRUFBRTtBQUNGLFdBQU87QUFBQSxNQUNMO0FBQUEsTUFDQSxhQUFhLFNBQVMsS0FBSyxtQkFBbUIsZUFBZTtBQUFBLE1BQzdELFVBQVUsU0FBUyxLQUFLLFlBQVk7QUFBQSxJQUN0QztBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sNkJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
