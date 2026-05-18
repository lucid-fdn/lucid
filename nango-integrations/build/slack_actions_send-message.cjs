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
  channel_id: import_zod.z.string().describe('Channel ID to send the message to. Example: "C1234567890"'),
  text: import_zod.z.string().describe('Text content of the message to send. Example: "Hello world"')
});
var OutputSchema = import_zod.z.object({
  ok: import_zod.z.boolean(),
  channel: import_zod.z.string(),
  ts: import_zod.z.string().describe("Timestamp ID of the sent message"),
  message: import_zod.z.object({
    type: import_zod.z.string(),
    user: import_zod.z.string(),
    text: import_zod.z.string(),
    ts: import_zod.z.string(),
    team: import_zod.z.string().optional(),
    bot_id: import_zod.z.string().optional(),
    app_id: import_zod.z.string().optional()
  }).optional()
});
var action = {
  type: "action",
  description: "Send a message to a channel",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/send-message",
    group: "Messages"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["chat:write"],
  exec: async (nango, input) => {
    const response = await nango.post({
      endpoint: "chat.postMessage",
      data: {
        channel: input.channel_id,
        text: input.text
      },
      retries: 3
    });
    if (!response.data || !response.data.ok) {
      throw new nango.ActionError({
        type: "slack_error",
        message: response.data?.error || "Failed to send message",
        response: response.data
      });
    }
    const message = response.data.message;
    return {
      ok: response.data.ok,
      channel: response.data.channel,
      ts: response.data.ts,
      message: message ? {
        type: message.type,
        user: message.user,
        text: message.text,
        ts: message.ts,
        team: message.team,
        bot_id: message.bot_id,
        app_id: message.app_id
      } : void 0
    };
  }
};
var send_message_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9zZW5kLW1lc3NhZ2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNoYW5uZWxfaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0NoYW5uZWwgSUQgdG8gc2VuZCB0aGUgbWVzc2FnZSB0by4gRXhhbXBsZTogXCJDMTIzNDU2Nzg5MFwiJyksXG4gIHRleHQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RleHQgY29udGVudCBvZiB0aGUgbWVzc2FnZSB0byBzZW5kLiBFeGFtcGxlOiBcIkhlbGxvIHdvcmxkXCInKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIG9rOiB6LmJvb2xlYW4oKSxcbiAgY2hhbm5lbDogei5zdHJpbmcoKSxcbiAgdHM6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RpbWVzdGFtcCBJRCBvZiB0aGUgc2VudCBtZXNzYWdlJyksXG4gIG1lc3NhZ2U6IHoub2JqZWN0KHtcbiAgICB0eXBlOiB6LnN0cmluZygpLFxuICAgIHVzZXI6IHouc3RyaW5nKCksXG4gICAgdGV4dDogei5zdHJpbmcoKSxcbiAgICB0czogei5zdHJpbmcoKSxcbiAgICB0ZWFtOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgYm90X2lkOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgYXBwX2lkOiB6LnN0cmluZygpLm9wdGlvbmFsKClcbiAgfSkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnU2VuZCBhIG1lc3NhZ2UgdG8gYSBjaGFubmVsJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvc2VuZC1tZXNzYWdlJyxcbiAgICBncm91cDogJ01lc3NhZ2VzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnY2hhdDp3cml0ZSddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgLy8gaHR0cHM6Ly9hcGkuc2xhY2suY29tL21ldGhvZHMvY2hhdC5wb3N0TWVzc2FnZVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucG9zdCh7XG4gICAgICBlbmRwb2ludDogJ2NoYXQucG9zdE1lc3NhZ2UnLFxuICAgICAgZGF0YToge1xuICAgICAgICBjaGFubmVsOiBpbnB1dC5jaGFubmVsX2lkLFxuICAgICAgICB0ZXh0OiBpbnB1dC50ZXh0XG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIGlmICghcmVzcG9uc2UuZGF0YSB8fCAhcmVzcG9uc2UuZGF0YS5vaykge1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ3NsYWNrX2Vycm9yJyxcbiAgICAgICAgbWVzc2FnZTogcmVzcG9uc2UuZGF0YT8uZXJyb3IgfHwgJ0ZhaWxlZCB0byBzZW5kIG1lc3NhZ2UnLFxuICAgICAgICByZXNwb25zZTogcmVzcG9uc2UuZGF0YVxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IG1lc3NhZ2UgPSByZXNwb25zZS5kYXRhLm1lc3NhZ2U7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9rOiByZXNwb25zZS5kYXRhLm9rLFxuICAgICAgY2hhbm5lbDogcmVzcG9uc2UuZGF0YS5jaGFubmVsLFxuICAgICAgdHM6IHJlc3BvbnNlLmRhdGEudHMsXG4gICAgICBtZXNzYWdlOiBtZXNzYWdlID8ge1xuICAgICAgICB0eXBlOiBtZXNzYWdlLnR5cGUsXG4gICAgICAgIHVzZXI6IG1lc3NhZ2UudXNlcixcbiAgICAgICAgdGV4dDogbWVzc2FnZS50ZXh0LFxuICAgICAgICB0czogbWVzc2FnZS50cyxcbiAgICAgICAgdGVhbTogbWVzc2FnZS50ZWFtLFxuICAgICAgICBib3RfaWQ6IG1lc3NhZ2UuYm90X2lkLFxuICAgICAgICBhcHBfaWQ6IG1lc3NhZ2UuYXBwX2lkXG4gICAgICB9IDogdW5kZWZpbmVkXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLFlBQVksYUFBRSxPQUFPLEVBQUUsU0FBUywyREFBMkQ7QUFBQSxFQUMzRixNQUFNLGFBQUUsT0FBTyxFQUFFLFNBQVMsNkRBQTZEO0FBQ3pGLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsSUFBSSxhQUFFLFFBQVE7QUFBQSxFQUNkLFNBQVMsYUFBRSxPQUFPO0FBQUEsRUFDbEIsSUFBSSxhQUFFLE9BQU8sRUFBRSxTQUFTLGtDQUFrQztBQUFBLEVBQzFELFNBQVMsYUFBRSxPQUFPO0FBQUEsSUFDaEIsTUFBTSxhQUFFLE9BQU87QUFBQSxJQUNmLE1BQU0sYUFBRSxPQUFPO0FBQUEsSUFDZixNQUFNLGFBQUUsT0FBTztBQUFBLElBQ2YsSUFBSSxhQUFFLE9BQU87QUFBQSxJQUNiLE1BQU0sYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLElBQzFCLFFBQVEsYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLElBQzVCLFFBQVEsYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLEVBQzlCLENBQUMsRUFBRSxTQUFTO0FBQ2QsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyxZQUFZO0FBQUEsRUFDckIsTUFBTSxPQUFPLE9BQU8sVUFBaUQ7QUFFbkUsVUFBTSxXQUFXLE1BQU0sTUFBTSxLQUFLO0FBQUEsTUFDaEMsVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLFFBQ0osU0FBUyxNQUFNO0FBQUEsUUFDZixNQUFNLE1BQU07QUFBQSxNQUNkO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsUUFBSSxDQUFDLFNBQVMsUUFBUSxDQUFDLFNBQVMsS0FBSyxJQUFJO0FBQ3ZDLFlBQU0sSUFBSSxNQUFNLFlBQVk7QUFBQSxRQUMxQixNQUFNO0FBQUEsUUFDTixTQUFTLFNBQVMsTUFBTSxTQUFTO0FBQUEsUUFDakMsVUFBVSxTQUFTO0FBQUEsTUFDckIsQ0FBQztBQUFBLElBQ0g7QUFDQSxVQUFNLFVBQVUsU0FBUyxLQUFLO0FBQzlCLFdBQU87QUFBQSxNQUNMLElBQUksU0FBUyxLQUFLO0FBQUEsTUFDbEIsU0FBUyxTQUFTLEtBQUs7QUFBQSxNQUN2QixJQUFJLFNBQVMsS0FBSztBQUFBLE1BQ2xCLFNBQVMsVUFBVTtBQUFBLFFBQ2pCLE1BQU0sUUFBUTtBQUFBLFFBQ2QsTUFBTSxRQUFRO0FBQUEsUUFDZCxNQUFNLFFBQVE7QUFBQSxRQUNkLElBQUksUUFBUTtBQUFBLFFBQ1osTUFBTSxRQUFRO0FBQUEsUUFDZCxRQUFRLFFBQVE7QUFBQSxRQUNoQixRQUFRLFFBQVE7QUFBQSxNQUNsQixJQUFJO0FBQUEsSUFDTjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sdUJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
