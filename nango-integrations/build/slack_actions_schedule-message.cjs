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

// slack/actions/schedule-message.ts
var schedule_message_exports = {};
__export(schedule_message_exports, {
  default: () => schedule_message_default
});
module.exports = __toCommonJS(schedule_message_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe('The channel to post to. Example: "C02MB5ZABA7"'),
  text: import_zod.z.string().describe("The message text to schedule"),
  post_at: import_zod.z.number().describe("Unix timestamp for when to post. Example: 1735689600"),
  thread_ts: import_zod.z.string().optional().describe('Optional thread timestamp to post in a thread. Example: "1234567890.123456"')
});
var OutputSchema = import_zod.z.object({
  scheduled_message_id: import_zod.z.string(),
  channel: import_zod.z.string(),
  post_at: import_zod.z.number()
});
var action = {
  type: "action",
  description: "Schedule a Slack message to a channel or thread, subject to Slack's 120-day scheduling limit.",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/schedule-message",
    group: "Messages"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["chat:write"],
  exec: async (nango, input) => {
    const response = await nango.post({
      // https://api.slack.com/methods/chat.scheduleMessage
      endpoint: "chat.scheduleMessage",
      data: {
        channel: input.channel_id,
        text: input.text,
        post_at: input.post_at,
        ...input.thread_ts && {
          thread_ts: input.thread_ts
        }
      },
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
      scheduled_message_id: response.data.scheduled_message_id,
      channel: response.data.channel,
      post_at: parseInt(response.data.post_at, 10)
    };
  }
};
var schedule_message_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9zY2hlZHVsZS1tZXNzYWdlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBjaGFubmVsX2lkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgY2hhbm5lbCB0byBwb3N0IHRvLiBFeGFtcGxlOiBcIkMwMk1CNVpBQkE3XCInKSxcbiAgdGV4dDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIG1lc3NhZ2UgdGV4dCB0byBzY2hlZHVsZScpLFxuICBwb3N0X2F0OiB6Lm51bWJlcigpLmRlc2NyaWJlKCdVbml4IHRpbWVzdGFtcCBmb3Igd2hlbiB0byBwb3N0LiBFeGFtcGxlOiAxNzM1Njg5NjAwJyksXG4gIHRocmVhZF90czogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdPcHRpb25hbCB0aHJlYWQgdGltZXN0YW1wIHRvIHBvc3QgaW4gYSB0aHJlYWQuIEV4YW1wbGU6IFwiMTIzNDU2Nzg5MC4xMjM0NTZcIicpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc2NoZWR1bGVkX21lc3NhZ2VfaWQ6IHouc3RyaW5nKCksXG4gIGNoYW5uZWw6IHouc3RyaW5nKCksXG4gIHBvc3RfYXQ6IHoubnVtYmVyKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogXCJTY2hlZHVsZSBhIFNsYWNrIG1lc3NhZ2UgdG8gYSBjaGFubmVsIG9yIHRocmVhZCwgc3ViamVjdCB0byBTbGFjaydzIDEyMC1kYXkgc2NoZWR1bGluZyBsaW1pdC5cIixcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvc2NoZWR1bGUtbWVzc2FnZScsXG4gICAgZ3JvdXA6ICdNZXNzYWdlcydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2NoYXQ6d3JpdGUnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucG9zdCh7XG4gICAgICAvLyBodHRwczovL2FwaS5zbGFjay5jb20vbWV0aG9kcy9jaGF0LnNjaGVkdWxlTWVzc2FnZVxuICAgICAgZW5kcG9pbnQ6ICdjaGF0LnNjaGVkdWxlTWVzc2FnZScsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIGNoYW5uZWw6IGlucHV0LmNoYW5uZWxfaWQsXG4gICAgICAgIHRleHQ6IGlucHV0LnRleHQsXG4gICAgICAgIHBvc3RfYXQ6IGlucHV0LnBvc3RfYXQsXG4gICAgICAgIC4uLihpbnB1dC50aHJlYWRfdHMgJiYge1xuICAgICAgICAgIHRocmVhZF90czogaW5wdXQudGhyZWFkX3RzXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIGlmICghcmVzcG9uc2UuZGF0YS5vaykge1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ3NsYWNrX2FwaV9lcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3BvbnNlLmRhdGEuZXJyb3IgfHwgJ1Vua25vd24gU2xhY2sgQVBJIGVycm9yJyxcbiAgICAgICAgZXJyb3I6IHJlc3BvbnNlLmRhdGEuZXJyb3JcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgc2NoZWR1bGVkX21lc3NhZ2VfaWQ6IHJlc3BvbnNlLmRhdGEuc2NoZWR1bGVkX21lc3NhZ2VfaWQsXG4gICAgICBjaGFubmVsOiByZXNwb25zZS5kYXRhLmNoYW5uZWwsXG4gICAgICBwb3N0X2F0OiBwYXJzZUludChyZXNwb25zZS5kYXRhLnBvc3RfYXQsIDEwKVxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixZQUFZLGFBQUUsT0FBTyxFQUFFLFNBQVMsZ0RBQWdEO0FBQUEsRUFDaEYsTUFBTSxhQUFFLE9BQU8sRUFBRSxTQUFTLDhCQUE4QjtBQUFBLEVBQ3hELFNBQVMsYUFBRSxPQUFPLEVBQUUsU0FBUyxzREFBc0Q7QUFBQSxFQUNuRixXQUFXLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLDZFQUE2RTtBQUN6SCxDQUFDO0FBQ0QsSUFBTSxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQzVCLHNCQUFzQixhQUFFLE9BQU87QUFBQSxFQUMvQixTQUFTLGFBQUUsT0FBTztBQUFBLEVBQ2xCLFNBQVMsYUFBRSxPQUFPO0FBQ3BCLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUMsWUFBWTtBQUFBLEVBQ3JCLE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBQ25FLFVBQU0sV0FBVyxNQUFNLE1BQU0sS0FBSztBQUFBO0FBQUEsTUFFaEMsVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLFFBQ0osU0FBUyxNQUFNO0FBQUEsUUFDZixNQUFNLE1BQU07QUFBQSxRQUNaLFNBQVMsTUFBTTtBQUFBLFFBQ2YsR0FBSSxNQUFNLGFBQWE7QUFBQSxVQUNyQixXQUFXLE1BQU07QUFBQSxRQUNuQjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxRQUFJLENBQUMsU0FBUyxLQUFLLElBQUk7QUFDckIsWUFBTSxJQUFJLE1BQU0sWUFBWTtBQUFBLFFBQzFCLE1BQU07QUFBQSxRQUNOLFNBQVMsU0FBUyxLQUFLLFNBQVM7QUFBQSxRQUNoQyxPQUFPLFNBQVMsS0FBSztBQUFBLE1BQ3ZCLENBQUM7QUFBQSxJQUNIO0FBQ0EsV0FBTztBQUFBLE1BQ0wsc0JBQXNCLFNBQVMsS0FBSztBQUFBLE1BQ3BDLFNBQVMsU0FBUyxLQUFLO0FBQUEsTUFDdkIsU0FBUyxTQUFTLFNBQVMsS0FBSyxTQUFTLEVBQUU7QUFBQSxJQUM3QztBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sMkJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
