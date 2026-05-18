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

// slack/actions/delete-message.ts
var delete_message_exports = {};
__export(delete_message_exports, {
  default: () => delete_message_default
});
module.exports = __toCommonJS(delete_message_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe('Channel ID containing the message. Example: "C1234567890"'),
  message_ts: import_zod.z.string().describe('Timestamp of the message to delete. Example: "1405894322.002768"')
});
var OutputSchema = import_zod.z.object({
  ok: import_zod.z.boolean(),
  channel: import_zod.z.string(),
  ts: import_zod.z.string()
});
var action = {
  type: "action",
  description: "Delete a message from a channel",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/delete-message",
    group: "Messages"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["chat:write"],
  exec: async (nango, input) => {
    const response = await nango.post({
      // https://api.slack.com/methods/chat.delete
      endpoint: "chat.delete",
      data: {
        channel: input.channel_id,
        ts: input.message_ts
      },
      retries: 3
    });
    if (!response.data.ok) {
      throw new nango.ActionError({
        type: "slack_api_error",
        message: response.data.error || "Failed to delete message",
        error: response.data.error
      });
    }
    return {
      ok: response.data.ok,
      channel: response.data.channel,
      ts: response.data.ts
    };
  }
};
var delete_message_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9kZWxldGUtbWVzc2FnZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgY2hhbm5lbF9pZDogei5zdHJpbmcoKS5kZXNjcmliZSgnQ2hhbm5lbCBJRCBjb250YWluaW5nIHRoZSBtZXNzYWdlLiBFeGFtcGxlOiBcIkMxMjM0NTY3ODkwXCInKSxcbiAgbWVzc2FnZV90czogei5zdHJpbmcoKS5kZXNjcmliZSgnVGltZXN0YW1wIG9mIHRoZSBtZXNzYWdlIHRvIGRlbGV0ZS4gRXhhbXBsZTogXCIxNDA1ODk0MzIyLjAwMjc2OFwiJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBvazogei5ib29sZWFuKCksXG4gIGNoYW5uZWw6IHouc3RyaW5nKCksXG4gIHRzOiB6LnN0cmluZygpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdEZWxldGUgYSBtZXNzYWdlIGZyb20gYSBjaGFubmVsJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvZGVsZXRlLW1lc3NhZ2UnLFxuICAgIGdyb3VwOiAnTWVzc2FnZXMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydjaGF0OndyaXRlJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnBvc3Qoe1xuICAgICAgLy8gaHR0cHM6Ly9hcGkuc2xhY2suY29tL21ldGhvZHMvY2hhdC5kZWxldGVcbiAgICAgIGVuZHBvaW50OiAnY2hhdC5kZWxldGUnLFxuICAgICAgZGF0YToge1xuICAgICAgICBjaGFubmVsOiBpbnB1dC5jaGFubmVsX2lkLFxuICAgICAgICB0czogaW5wdXQubWVzc2FnZV90c1xuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBpZiAoIXJlc3BvbnNlLmRhdGEub2spIHtcbiAgICAgIHRocm93IG5ldyBuYW5nby5BY3Rpb25FcnJvcih7XG4gICAgICAgIHR5cGU6ICdzbGFja19hcGlfZXJyb3InLFxuICAgICAgICBtZXNzYWdlOiByZXNwb25zZS5kYXRhLmVycm9yIHx8ICdGYWlsZWQgdG8gZGVsZXRlIG1lc3NhZ2UnLFxuICAgICAgICBlcnJvcjogcmVzcG9uc2UuZGF0YS5lcnJvclxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBvazogcmVzcG9uc2UuZGF0YS5vayxcbiAgICAgIGNoYW5uZWw6IHJlc3BvbnNlLmRhdGEuY2hhbm5lbCxcbiAgICAgIHRzOiByZXNwb25zZS5kYXRhLnRzXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLFlBQVksYUFBRSxPQUFPLEVBQUUsU0FBUywyREFBMkQ7QUFBQSxFQUMzRixZQUFZLGFBQUUsT0FBTyxFQUFFLFNBQVMsa0VBQWtFO0FBQ3BHLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsSUFBSSxhQUFFLFFBQVE7QUFBQSxFQUNkLFNBQVMsYUFBRSxPQUFPO0FBQUEsRUFDbEIsSUFBSSxhQUFFLE9BQU87QUFDZixDQUFDO0FBQ0QsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsUUFBUSxDQUFDLFlBQVk7QUFBQSxFQUNyQixNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUNuRSxVQUFNLFdBQVcsTUFBTSxNQUFNLEtBQUs7QUFBQTtBQUFBLE1BRWhDLFVBQVU7QUFBQSxNQUNWLE1BQU07QUFBQSxRQUNKLFNBQVMsTUFBTTtBQUFBLFFBQ2YsSUFBSSxNQUFNO0FBQUEsTUFDWjtBQUFBLE1BQ0EsU0FBUztBQUFBLElBQ1gsQ0FBQztBQUNELFFBQUksQ0FBQyxTQUFTLEtBQUssSUFBSTtBQUNyQixZQUFNLElBQUksTUFBTSxZQUFZO0FBQUEsUUFDMUIsTUFBTTtBQUFBLFFBQ04sU0FBUyxTQUFTLEtBQUssU0FBUztBQUFBLFFBQ2hDLE9BQU8sU0FBUyxLQUFLO0FBQUEsTUFDdkIsQ0FBQztBQUFBLElBQ0g7QUFDQSxXQUFPO0FBQUEsTUFDTCxJQUFJLFNBQVMsS0FBSztBQUFBLE1BQ2xCLFNBQVMsU0FBUyxLQUFLO0FBQUEsTUFDdkIsSUFBSSxTQUFTLEtBQUs7QUFBQSxJQUNwQjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8seUJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
