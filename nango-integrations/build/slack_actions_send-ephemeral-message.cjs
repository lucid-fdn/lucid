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

// slack/actions/send-ephemeral-message.ts
var send_ephemeral_message_exports = {};
__export(send_ephemeral_message_exports, {
  default: () => send_ephemeral_message_default
});
module.exports = __toCommonJS(send_ephemeral_message_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe('Channel ID to send the ephemeral message to. Example: "C1234567890"'),
  user_id: import_zod.z.string().describe('User ID to send the ephemeral message to. The user must be in the specified channel. Example: "U1234567890"'),
  text: import_zod.z.string().describe("Text of the message to send. Supports Slack formatting."),
  thread_ts: import_zod.z.string().optional().describe('Thread timestamp to reply to a specific thread. Example: "1234567890.123456"')
});
var OutputSchema = import_zod.z.object({
  ok: import_zod.z.boolean(),
  message_ts: import_zod.z.string(),
  error: import_zod.z.string().optional()
});
var action = {
  type: "action",
  description: "Send a message visible only to one user in a channel",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/send-ephemeral-message",
    group: "Messaging"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["chat:write"],
  exec: async (nango, input) => {
    const response = await nango.post({
      // https://docs.slack.dev/reference/methods/chat.postEphemeral/
      endpoint: "chat.postEphemeral",
      data: {
        channel: input.channel_id,
        user: input.user_id,
        text: input.text,
        ...input.thread_ts && {
          thread_ts: input.thread_ts
        }
      },
      retries: 3
    });
    if (!response.data.ok) {
      throw new nango.ActionError({
        type: "slack_error",
        message: response.data.error || "Failed to send ephemeral message",
        error: response.data.error
      });
    }
    return {
      ok: response.data.ok,
      message_ts: response.data.message_ts,
      error: response.data.error
    };
  }
};
var send_ephemeral_message_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9zZW5kLWVwaGVtZXJhbC1tZXNzYWdlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBjaGFubmVsX2lkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDaGFubmVsIElEIHRvIHNlbmQgdGhlIGVwaGVtZXJhbCBtZXNzYWdlIHRvLiBFeGFtcGxlOiBcIkMxMjM0NTY3ODkwXCInKSxcbiAgdXNlcl9pZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVXNlciBJRCB0byBzZW5kIHRoZSBlcGhlbWVyYWwgbWVzc2FnZSB0by4gVGhlIHVzZXIgbXVzdCBiZSBpbiB0aGUgc3BlY2lmaWVkIGNoYW5uZWwuIEV4YW1wbGU6IFwiVTEyMzQ1Njc4OTBcIicpLFxuICB0ZXh0OiB6LnN0cmluZygpLmRlc2NyaWJlKCdUZXh0IG9mIHRoZSBtZXNzYWdlIHRvIHNlbmQuIFN1cHBvcnRzIFNsYWNrIGZvcm1hdHRpbmcuJyksXG4gIHRocmVhZF90czogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUaHJlYWQgdGltZXN0YW1wIHRvIHJlcGx5IHRvIGEgc3BlY2lmaWMgdGhyZWFkLiBFeGFtcGxlOiBcIjEyMzQ1Njc4OTAuMTIzNDU2XCInKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIG9rOiB6LmJvb2xlYW4oKSxcbiAgbWVzc2FnZV90czogei5zdHJpbmcoKSxcbiAgZXJyb3I6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnU2VuZCBhIG1lc3NhZ2UgdmlzaWJsZSBvbmx5IHRvIG9uZSB1c2VyIGluIGEgY2hhbm5lbCcsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL3NlbmQtZXBoZW1lcmFsLW1lc3NhZ2UnLFxuICAgIGdyb3VwOiAnTWVzc2FnaW5nJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnY2hhdDp3cml0ZSddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wb3N0KHtcbiAgICAgIC8vIGh0dHBzOi8vZG9jcy5zbGFjay5kZXYvcmVmZXJlbmNlL21ldGhvZHMvY2hhdC5wb3N0RXBoZW1lcmFsL1xuICAgICAgZW5kcG9pbnQ6ICdjaGF0LnBvc3RFcGhlbWVyYWwnLFxuICAgICAgZGF0YToge1xuICAgICAgICBjaGFubmVsOiBpbnB1dC5jaGFubmVsX2lkLFxuICAgICAgICB1c2VyOiBpbnB1dC51c2VyX2lkLFxuICAgICAgICB0ZXh0OiBpbnB1dC50ZXh0LFxuICAgICAgICAuLi4oaW5wdXQudGhyZWFkX3RzICYmIHtcbiAgICAgICAgICB0aHJlYWRfdHM6IGlucHV0LnRocmVhZF90c1xuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBpZiAoIXJlc3BvbnNlLmRhdGEub2spIHtcbiAgICAgIHRocm93IG5ldyBuYW5nby5BY3Rpb25FcnJvcih7XG4gICAgICAgIHR5cGU6ICdzbGFja19lcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3BvbnNlLmRhdGEuZXJyb3IgfHwgJ0ZhaWxlZCB0byBzZW5kIGVwaGVtZXJhbCBtZXNzYWdlJyxcbiAgICAgICAgZXJyb3I6IHJlc3BvbnNlLmRhdGEuZXJyb3JcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgb2s6IHJlc3BvbnNlLmRhdGEub2ssXG4gICAgICBtZXNzYWdlX3RzOiByZXNwb25zZS5kYXRhLm1lc3NhZ2VfdHMsXG4gICAgICBlcnJvcjogcmVzcG9uc2UuZGF0YS5lcnJvclxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixZQUFZLGFBQUUsT0FBTyxFQUFFLFNBQVMscUVBQXFFO0FBQUEsRUFDckcsU0FBUyxhQUFFLE9BQU8sRUFBRSxTQUFTLDZHQUE2RztBQUFBLEVBQzFJLE1BQU0sYUFBRSxPQUFPLEVBQUUsU0FBUyx5REFBeUQ7QUFBQSxFQUNuRixXQUFXLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLDhFQUE4RTtBQUMxSCxDQUFDO0FBQ0QsSUFBTSxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQzVCLElBQUksYUFBRSxRQUFRO0FBQUEsRUFDZCxZQUFZLGFBQUUsT0FBTztBQUFBLEVBQ3JCLE9BQU8sYUFBRSxPQUFPLEVBQUUsU0FBUztBQUM3QixDQUFDO0FBQ0QsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsUUFBUSxDQUFDLFlBQVk7QUFBQSxFQUNyQixNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUNuRSxVQUFNLFdBQVcsTUFBTSxNQUFNLEtBQUs7QUFBQTtBQUFBLE1BRWhDLFVBQVU7QUFBQSxNQUNWLE1BQU07QUFBQSxRQUNKLFNBQVMsTUFBTTtBQUFBLFFBQ2YsTUFBTSxNQUFNO0FBQUEsUUFDWixNQUFNLE1BQU07QUFBQSxRQUNaLEdBQUksTUFBTSxhQUFhO0FBQUEsVUFDckIsV0FBVyxNQUFNO0FBQUEsUUFDbkI7QUFBQSxNQUNGO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsUUFBSSxDQUFDLFNBQVMsS0FBSyxJQUFJO0FBQ3JCLFlBQU0sSUFBSSxNQUFNLFlBQVk7QUFBQSxRQUMxQixNQUFNO0FBQUEsUUFDTixTQUFTLFNBQVMsS0FBSyxTQUFTO0FBQUEsUUFDaEMsT0FBTyxTQUFTLEtBQUs7QUFBQSxNQUN2QixDQUFDO0FBQUEsSUFDSDtBQUNBLFdBQU87QUFBQSxNQUNMLElBQUksU0FBUyxLQUFLO0FBQUEsTUFDbEIsWUFBWSxTQUFTLEtBQUs7QUFBQSxNQUMxQixPQUFPLFNBQVMsS0FBSztBQUFBLElBQ3ZCO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyxpQ0FBUTsiLAogICJuYW1lcyI6IFtdCn0K
