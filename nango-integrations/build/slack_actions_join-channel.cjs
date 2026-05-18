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

// slack/actions/join-channel.ts
var join_channel_exports = {};
__export(join_channel_exports, {
  default: () => join_channel_default
});
module.exports = __toCommonJS(join_channel_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe("ID of the channel to join. Example: C061EG9SL")
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  name: import_zod.z.string().optional(),
  is_channel: import_zod.z.boolean().optional(),
  is_group: import_zod.z.boolean().optional(),
  is_im: import_zod.z.boolean().optional(),
  is_private: import_zod.z.boolean().optional(),
  is_archived: import_zod.z.boolean().optional(),
  is_general: import_zod.z.boolean().optional(),
  created: import_zod.z.number().optional(),
  creator: import_zod.z.string().optional(),
  is_member: import_zod.z.boolean().optional(),
  num_members: import_zod.z.number().optional(),
  topic: import_zod.z.object({
    value: import_zod.z.string(),
    creator: import_zod.z.string(),
    last_set: import_zod.z.number()
  }).optional(),
  purpose: import_zod.z.object({
    value: import_zod.z.string(),
    creator: import_zod.z.string(),
    last_set: import_zod.z.number()
  }).optional()
});
var action = {
  type: "action",
  description: "Join a public or private channel and return its conversation details",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/join-channel",
    group: "Conversations"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:join", "groups:write"],
  exec: async (nango, input) => {
    const response = await nango.post({
      endpoint: "conversations.join",
      data: {
        channel: input.channel_id
      },
      retries: 3
    });
    if (!response.data || !response.data.ok) {
      throw new nango.ActionError({
        type: "api_error",
        message: response.data?.error || "Failed to join channel",
        channel_id: input.channel_id
      });
    }
    const channel = response.data.channel;
    return {
      id: channel.id,
      name: channel.name ?? void 0,
      is_channel: channel.is_channel,
      is_group: channel.is_group,
      is_im: channel.is_im,
      is_private: channel.is_private,
      is_archived: channel.is_archived,
      is_general: channel.is_general,
      created: channel.created ?? void 0,
      creator: channel.creator ?? void 0,
      is_member: channel.is_member,
      num_members: channel.num_members ?? void 0,
      topic: channel.topic ? {
        value: channel.topic.value ?? "",
        creator: channel.topic.creator ?? "",
        last_set: channel.topic.last_set ?? 0
      } : void 0,
      purpose: channel.purpose ? {
        value: channel.purpose.value ?? "",
        creator: channel.purpose.creator ?? "",
        last_set: channel.purpose.last_set ?? 0
      } : void 0
    };
  }
};
var join_channel_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9qb2luLWNoYW5uZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNoYW5uZWxfaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0lEIG9mIHRoZSBjaGFubmVsIHRvIGpvaW4uIEV4YW1wbGU6IEMwNjFFRzlTTCcpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIG5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgaXNfY2hhbm5lbDogei5ib29sZWFuKCkub3B0aW9uYWwoKSxcbiAgaXNfZ3JvdXA6IHouYm9vbGVhbigpLm9wdGlvbmFsKCksXG4gIGlzX2ltOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLFxuICBpc19wcml2YXRlOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLFxuICBpc19hcmNoaXZlZDogei5ib29sZWFuKCkub3B0aW9uYWwoKSxcbiAgaXNfZ2VuZXJhbDogei5ib29sZWFuKCkub3B0aW9uYWwoKSxcbiAgY3JlYXRlZDogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICBjcmVhdG9yOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGlzX21lbWJlcjogei5ib29sZWFuKCkub3B0aW9uYWwoKSxcbiAgbnVtX21lbWJlcnM6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgdG9waWM6IHoub2JqZWN0KHtcbiAgICB2YWx1ZTogei5zdHJpbmcoKSxcbiAgICBjcmVhdG9yOiB6LnN0cmluZygpLFxuICAgIGxhc3Rfc2V0OiB6Lm51bWJlcigpXG4gIH0pLm9wdGlvbmFsKCksXG4gIHB1cnBvc2U6IHoub2JqZWN0KHtcbiAgICB2YWx1ZTogei5zdHJpbmcoKSxcbiAgICBjcmVhdG9yOiB6LnN0cmluZygpLFxuICAgIGxhc3Rfc2V0OiB6Lm51bWJlcigpXG4gIH0pLm9wdGlvbmFsKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0pvaW4gYSBwdWJsaWMgb3IgcHJpdmF0ZSBjaGFubmVsIGFuZCByZXR1cm4gaXRzIGNvbnZlcnNhdGlvbiBkZXRhaWxzJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvam9pbi1jaGFubmVsJyxcbiAgICBncm91cDogJ0NvbnZlcnNhdGlvbnMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydjaGFubmVsczpqb2luJywgJ2dyb3Vwczp3cml0ZSddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgLy8gaHR0cHM6Ly9kb2NzLnNsYWNrLmRldi9yZWZlcmVuY2UvbWV0aG9kcy9jb252ZXJzYXRpb25zLmpvaW5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnBvc3Qoe1xuICAgICAgZW5kcG9pbnQ6ICdjb252ZXJzYXRpb25zLmpvaW4nLFxuICAgICAgZGF0YToge1xuICAgICAgICBjaGFubmVsOiBpbnB1dC5jaGFubmVsX2lkXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIGlmICghcmVzcG9uc2UuZGF0YSB8fCAhcmVzcG9uc2UuZGF0YS5vaykge1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ2FwaV9lcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3BvbnNlLmRhdGE/LmVycm9yIHx8ICdGYWlsZWQgdG8gam9pbiBjaGFubmVsJyxcbiAgICAgICAgY2hhbm5lbF9pZDogaW5wdXQuY2hhbm5lbF9pZFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IGNoYW5uZWwgPSByZXNwb25zZS5kYXRhLmNoYW5uZWw7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBjaGFubmVsLmlkLFxuICAgICAgbmFtZTogY2hhbm5lbC5uYW1lID8/IHVuZGVmaW5lZCxcbiAgICAgIGlzX2NoYW5uZWw6IGNoYW5uZWwuaXNfY2hhbm5lbCxcbiAgICAgIGlzX2dyb3VwOiBjaGFubmVsLmlzX2dyb3VwLFxuICAgICAgaXNfaW06IGNoYW5uZWwuaXNfaW0sXG4gICAgICBpc19wcml2YXRlOiBjaGFubmVsLmlzX3ByaXZhdGUsXG4gICAgICBpc19hcmNoaXZlZDogY2hhbm5lbC5pc19hcmNoaXZlZCxcbiAgICAgIGlzX2dlbmVyYWw6IGNoYW5uZWwuaXNfZ2VuZXJhbCxcbiAgICAgIGNyZWF0ZWQ6IGNoYW5uZWwuY3JlYXRlZCA/PyB1bmRlZmluZWQsXG4gICAgICBjcmVhdG9yOiBjaGFubmVsLmNyZWF0b3IgPz8gdW5kZWZpbmVkLFxuICAgICAgaXNfbWVtYmVyOiBjaGFubmVsLmlzX21lbWJlcixcbiAgICAgIG51bV9tZW1iZXJzOiBjaGFubmVsLm51bV9tZW1iZXJzID8/IHVuZGVmaW5lZCxcbiAgICAgIHRvcGljOiBjaGFubmVsLnRvcGljID8ge1xuICAgICAgICB2YWx1ZTogY2hhbm5lbC50b3BpYy52YWx1ZSA/PyAnJyxcbiAgICAgICAgY3JlYXRvcjogY2hhbm5lbC50b3BpYy5jcmVhdG9yID8/ICcnLFxuICAgICAgICBsYXN0X3NldDogY2hhbm5lbC50b3BpYy5sYXN0X3NldCA/PyAwXG4gICAgICB9IDogdW5kZWZpbmVkLFxuICAgICAgcHVycG9zZTogY2hhbm5lbC5wdXJwb3NlID8ge1xuICAgICAgICB2YWx1ZTogY2hhbm5lbC5wdXJwb3NlLnZhbHVlID8/ICcnLFxuICAgICAgICBjcmVhdG9yOiBjaGFubmVsLnB1cnBvc2UuY3JlYXRvciA/PyAnJyxcbiAgICAgICAgbGFzdF9zZXQ6IGNoYW5uZWwucHVycG9zZS5sYXN0X3NldCA/PyAwXG4gICAgICB9IDogdW5kZWZpbmVkXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLFlBQVksYUFBRSxPQUFPLEVBQUUsU0FBUywrQ0FBK0M7QUFDakYsQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixJQUFJLGFBQUUsT0FBTztBQUFBLEVBQ2IsTUFBTSxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDMUIsWUFBWSxhQUFFLFFBQVEsRUFBRSxTQUFTO0FBQUEsRUFDakMsVUFBVSxhQUFFLFFBQVEsRUFBRSxTQUFTO0FBQUEsRUFDL0IsT0FBTyxhQUFFLFFBQVEsRUFBRSxTQUFTO0FBQUEsRUFDNUIsWUFBWSxhQUFFLFFBQVEsRUFBRSxTQUFTO0FBQUEsRUFDakMsYUFBYSxhQUFFLFFBQVEsRUFBRSxTQUFTO0FBQUEsRUFDbEMsWUFBWSxhQUFFLFFBQVEsRUFBRSxTQUFTO0FBQUEsRUFDakMsU0FBUyxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDN0IsU0FBUyxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDN0IsV0FBVyxhQUFFLFFBQVEsRUFBRSxTQUFTO0FBQUEsRUFDaEMsYUFBYSxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDakMsT0FBTyxhQUFFLE9BQU87QUFBQSxJQUNkLE9BQU8sYUFBRSxPQUFPO0FBQUEsSUFDaEIsU0FBUyxhQUFFLE9BQU87QUFBQSxJQUNsQixVQUFVLGFBQUUsT0FBTztBQUFBLEVBQ3JCLENBQUMsRUFBRSxTQUFTO0FBQUEsRUFDWixTQUFTLGFBQUUsT0FBTztBQUFBLElBQ2hCLE9BQU8sYUFBRSxPQUFPO0FBQUEsSUFDaEIsU0FBUyxhQUFFLE9BQU87QUFBQSxJQUNsQixVQUFVLGFBQUUsT0FBTztBQUFBLEVBQ3JCLENBQUMsRUFBRSxTQUFTO0FBQ2QsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyxpQkFBaUIsY0FBYztBQUFBLEVBQ3hDLE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBRW5FLFVBQU0sV0FBVyxNQUFNLE1BQU0sS0FBSztBQUFBLE1BQ2hDLFVBQVU7QUFBQSxNQUNWLE1BQU07QUFBQSxRQUNKLFNBQVMsTUFBTTtBQUFBLE1BQ2pCO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsUUFBSSxDQUFDLFNBQVMsUUFBUSxDQUFDLFNBQVMsS0FBSyxJQUFJO0FBQ3ZDLFlBQU0sSUFBSSxNQUFNLFlBQVk7QUFBQSxRQUMxQixNQUFNO0FBQUEsUUFDTixTQUFTLFNBQVMsTUFBTSxTQUFTO0FBQUEsUUFDakMsWUFBWSxNQUFNO0FBQUEsTUFDcEIsQ0FBQztBQUFBLElBQ0g7QUFDQSxVQUFNLFVBQVUsU0FBUyxLQUFLO0FBQzlCLFdBQU87QUFBQSxNQUNMLElBQUksUUFBUTtBQUFBLE1BQ1osTUFBTSxRQUFRLFFBQVE7QUFBQSxNQUN0QixZQUFZLFFBQVE7QUFBQSxNQUNwQixVQUFVLFFBQVE7QUFBQSxNQUNsQixPQUFPLFFBQVE7QUFBQSxNQUNmLFlBQVksUUFBUTtBQUFBLE1BQ3BCLGFBQWEsUUFBUTtBQUFBLE1BQ3JCLFlBQVksUUFBUTtBQUFBLE1BQ3BCLFNBQVMsUUFBUSxXQUFXO0FBQUEsTUFDNUIsU0FBUyxRQUFRLFdBQVc7QUFBQSxNQUM1QixXQUFXLFFBQVE7QUFBQSxNQUNuQixhQUFhLFFBQVEsZUFBZTtBQUFBLE1BQ3BDLE9BQU8sUUFBUSxRQUFRO0FBQUEsUUFDckIsT0FBTyxRQUFRLE1BQU0sU0FBUztBQUFBLFFBQzlCLFNBQVMsUUFBUSxNQUFNLFdBQVc7QUFBQSxRQUNsQyxVQUFVLFFBQVEsTUFBTSxZQUFZO0FBQUEsTUFDdEMsSUFBSTtBQUFBLE1BQ0osU0FBUyxRQUFRLFVBQVU7QUFBQSxRQUN6QixPQUFPLFFBQVEsUUFBUSxTQUFTO0FBQUEsUUFDaEMsU0FBUyxRQUFRLFFBQVEsV0FBVztBQUFBLFFBQ3BDLFVBQVUsUUFBUSxRQUFRLFlBQVk7QUFBQSxNQUN4QyxJQUFJO0FBQUEsSUFDTjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sdUJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
