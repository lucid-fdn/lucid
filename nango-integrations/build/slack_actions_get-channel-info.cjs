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

// slack/actions/get-channel-info.ts
var get_channel_info_exports = {};
__export(get_channel_info_exports, {
  default: () => get_channel_info_default
});
module.exports = __toCommonJS(get_channel_info_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe('Slack channel ID to retrieve information about. Example: "C012AB3CD"')
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("Channel ID"),
  name: import_zod.z.string().optional().describe("Channel name"),
  topic: import_zod.z.object({
    value: import_zod.z.string(),
    creator: import_zod.z.string(),
    last_set: import_zod.z.number()
  }).optional().describe("Channel topic information"),
  purpose: import_zod.z.object({
    value: import_zod.z.string(),
    creator: import_zod.z.string(),
    last_set: import_zod.z.number()
  }).optional().describe("Channel purpose information"),
  is_channel: import_zod.z.boolean().describe("Whether this is a public channel"),
  is_group: import_zod.z.boolean().describe("Whether this is a private channel"),
  is_im: import_zod.z.boolean().describe("Whether this is a direct message"),
  is_mpim: import_zod.z.boolean().describe("Whether this is a multi-person direct message"),
  is_private: import_zod.z.boolean().describe("Whether the conversation is private"),
  is_archived: import_zod.z.boolean().describe("Whether the channel is archived"),
  is_general: import_zod.z.boolean().optional().describe("Whether this is the general channel"),
  created: import_zod.z.number().describe("Unix timestamp when the channel was created"),
  creator: import_zod.z.string().optional().describe("User ID of the channel creator"),
  num_members: import_zod.z.number().optional().describe("Number of members in the channel (if available)"),
  context_team_id: import_zod.z.string().optional().describe("Team ID for the conversation")
});
var action = {
  type: "action",
  description: "Retrieve conversation details including topic, purpose, and membership state",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/get-channel-info",
    group: "Channels"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:read", "groups:read", "im:read", "mpim:read"],
  exec: async (nango, input) => {
    const response = await nango.get({
      // https://api.slack.com/methods/conversations.info
      endpoint: "conversations.info",
      params: {
        channel: input.channel_id,
        include_num_members: "true"
      },
      retries: 3
    });
    if (!response.data || response.data.ok === false) {
      throw new nango.ActionError({
        type: "api_error",
        message: response.data?.error || "Failed to retrieve channel information",
        channel_id: input.channel_id
      });
    }
    const channel = response.data.channel;
    return {
      id: channel.id,
      name: channel.name ?? void 0,
      topic: channel.topic ?? void 0,
      purpose: channel.purpose ?? void 0,
      is_channel: channel.is_channel ?? false,
      is_group: channel.is_group ?? false,
      is_im: channel.is_im ?? false,
      is_mpim: channel.is_mpim ?? false,
      is_private: channel.is_private ?? false,
      is_archived: channel.is_archived ?? false,
      is_general: channel.is_general ?? void 0,
      created: channel.created ?? 0,
      creator: channel.creator ?? void 0,
      num_members: channel.num_members ?? void 0,
      context_team_id: channel.context_team_id ?? void 0
    };
  }
};
var get_channel_info_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9nZXQtY2hhbm5lbC1pbmZvLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBjaGFubmVsX2lkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTbGFjayBjaGFubmVsIElEIHRvIHJldHJpZXZlIGluZm9ybWF0aW9uIGFib3V0LiBFeGFtcGxlOiBcIkMwMTJBQjNDRFwiJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnQ2hhbm5lbCBJRCcpLFxuICBuYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NoYW5uZWwgbmFtZScpLFxuICB0b3BpYzogei5vYmplY3Qoe1xuICAgIHZhbHVlOiB6LnN0cmluZygpLFxuICAgIGNyZWF0b3I6IHouc3RyaW5nKCksXG4gICAgbGFzdF9zZXQ6IHoubnVtYmVyKClcbiAgfSkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ2hhbm5lbCB0b3BpYyBpbmZvcm1hdGlvbicpLFxuICBwdXJwb3NlOiB6Lm9iamVjdCh7XG4gICAgdmFsdWU6IHouc3RyaW5nKCksXG4gICAgY3JlYXRvcjogei5zdHJpbmcoKSxcbiAgICBsYXN0X3NldDogei5udW1iZXIoKVxuICB9KS5vcHRpb25hbCgpLmRlc2NyaWJlKCdDaGFubmVsIHB1cnBvc2UgaW5mb3JtYXRpb24nKSxcbiAgaXNfY2hhbm5lbDogei5ib29sZWFuKCkuZGVzY3JpYmUoJ1doZXRoZXIgdGhpcyBpcyBhIHB1YmxpYyBjaGFubmVsJyksXG4gIGlzX2dyb3VwOiB6LmJvb2xlYW4oKS5kZXNjcmliZSgnV2hldGhlciB0aGlzIGlzIGEgcHJpdmF0ZSBjaGFubmVsJyksXG4gIGlzX2ltOiB6LmJvb2xlYW4oKS5kZXNjcmliZSgnV2hldGhlciB0aGlzIGlzIGEgZGlyZWN0IG1lc3NhZ2UnKSxcbiAgaXNfbXBpbTogei5ib29sZWFuKCkuZGVzY3JpYmUoJ1doZXRoZXIgdGhpcyBpcyBhIG11bHRpLXBlcnNvbiBkaXJlY3QgbWVzc2FnZScpLFxuICBpc19wcml2YXRlOiB6LmJvb2xlYW4oKS5kZXNjcmliZSgnV2hldGhlciB0aGUgY29udmVyc2F0aW9uIGlzIHByaXZhdGUnKSxcbiAgaXNfYXJjaGl2ZWQ6IHouYm9vbGVhbigpLmRlc2NyaWJlKCdXaGV0aGVyIHRoZSBjaGFubmVsIGlzIGFyY2hpdmVkJyksXG4gIGlzX2dlbmVyYWw6IHouYm9vbGVhbigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1doZXRoZXIgdGhpcyBpcyB0aGUgZ2VuZXJhbCBjaGFubmVsJyksXG4gIGNyZWF0ZWQ6IHoubnVtYmVyKCkuZGVzY3JpYmUoJ1VuaXggdGltZXN0YW1wIHdoZW4gdGhlIGNoYW5uZWwgd2FzIGNyZWF0ZWQnKSxcbiAgY3JlYXRvcjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdVc2VyIElEIG9mIHRoZSBjaGFubmVsIGNyZWF0b3InKSxcbiAgbnVtX21lbWJlcnM6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTnVtYmVyIG9mIG1lbWJlcnMgaW4gdGhlIGNoYW5uZWwgKGlmIGF2YWlsYWJsZSknKSxcbiAgY29udGV4dF90ZWFtX2lkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RlYW0gSUQgZm9yIHRoZSBjb252ZXJzYXRpb24nKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnUmV0cmlldmUgY29udmVyc2F0aW9uIGRldGFpbHMgaW5jbHVkaW5nIHRvcGljLCBwdXJwb3NlLCBhbmQgbWVtYmVyc2hpcCBzdGF0ZScsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL2dldC1jaGFubmVsLWluZm8nLFxuICAgIGdyb3VwOiAnQ2hhbm5lbHMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydjaGFubmVsczpyZWFkJywgJ2dyb3VwczpyZWFkJywgJ2ltOnJlYWQnLCAnbXBpbTpyZWFkJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLmdldCh7XG4gICAgICAvLyBodHRwczovL2FwaS5zbGFjay5jb20vbWV0aG9kcy9jb252ZXJzYXRpb25zLmluZm9cbiAgICAgIGVuZHBvaW50OiAnY29udmVyc2F0aW9ucy5pbmZvJyxcbiAgICAgIHBhcmFtczoge1xuICAgICAgICBjaGFubmVsOiBpbnB1dC5jaGFubmVsX2lkLFxuICAgICAgICBpbmNsdWRlX251bV9tZW1iZXJzOiAndHJ1ZSdcbiAgICAgIH0sXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgaWYgKCFyZXNwb25zZS5kYXRhIHx8IHJlc3BvbnNlLmRhdGEub2sgPT09IGZhbHNlKSB7XG4gICAgICB0aHJvdyBuZXcgbmFuZ28uQWN0aW9uRXJyb3Ioe1xuICAgICAgICB0eXBlOiAnYXBpX2Vycm9yJyxcbiAgICAgICAgbWVzc2FnZTogcmVzcG9uc2UuZGF0YT8uZXJyb3IgfHwgJ0ZhaWxlZCB0byByZXRyaWV2ZSBjaGFubmVsIGluZm9ybWF0aW9uJyxcbiAgICAgICAgY2hhbm5lbF9pZDogaW5wdXQuY2hhbm5lbF9pZFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IGNoYW5uZWwgPSByZXNwb25zZS5kYXRhLmNoYW5uZWw7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBjaGFubmVsLmlkLFxuICAgICAgbmFtZTogY2hhbm5lbC5uYW1lID8/IHVuZGVmaW5lZCxcbiAgICAgIHRvcGljOiBjaGFubmVsLnRvcGljID8/IHVuZGVmaW5lZCxcbiAgICAgIHB1cnBvc2U6IGNoYW5uZWwucHVycG9zZSA/PyB1bmRlZmluZWQsXG4gICAgICBpc19jaGFubmVsOiBjaGFubmVsLmlzX2NoYW5uZWwgPz8gZmFsc2UsXG4gICAgICBpc19ncm91cDogY2hhbm5lbC5pc19ncm91cCA/PyBmYWxzZSxcbiAgICAgIGlzX2ltOiBjaGFubmVsLmlzX2ltID8/IGZhbHNlLFxuICAgICAgaXNfbXBpbTogY2hhbm5lbC5pc19tcGltID8/IGZhbHNlLFxuICAgICAgaXNfcHJpdmF0ZTogY2hhbm5lbC5pc19wcml2YXRlID8/IGZhbHNlLFxuICAgICAgaXNfYXJjaGl2ZWQ6IGNoYW5uZWwuaXNfYXJjaGl2ZWQgPz8gZmFsc2UsXG4gICAgICBpc19nZW5lcmFsOiBjaGFubmVsLmlzX2dlbmVyYWwgPz8gdW5kZWZpbmVkLFxuICAgICAgY3JlYXRlZDogY2hhbm5lbC5jcmVhdGVkID8/IDAsXG4gICAgICBjcmVhdG9yOiBjaGFubmVsLmNyZWF0b3IgPz8gdW5kZWZpbmVkLFxuICAgICAgbnVtX21lbWJlcnM6IGNoYW5uZWwubnVtX21lbWJlcnMgPz8gdW5kZWZpbmVkLFxuICAgICAgY29udGV4dF90ZWFtX2lkOiBjaGFubmVsLmNvbnRleHRfdGVhbV9pZCA/PyB1bmRlZmluZWRcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUVsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsWUFBWSxhQUFFLE9BQU8sRUFBRSxTQUFTLHNFQUFzRTtBQUN4RyxDQUFDO0FBQ0QsSUFBTSxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQzVCLElBQUksYUFBRSxPQUFPLEVBQUUsU0FBUyxZQUFZO0FBQUEsRUFDcEMsTUFBTSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyxjQUFjO0FBQUEsRUFDbkQsT0FBTyxhQUFFLE9BQU87QUFBQSxJQUNkLE9BQU8sYUFBRSxPQUFPO0FBQUEsSUFDaEIsU0FBUyxhQUFFLE9BQU87QUFBQSxJQUNsQixVQUFVLGFBQUUsT0FBTztBQUFBLEVBQ3JCLENBQUMsRUFBRSxTQUFTLEVBQUUsU0FBUywyQkFBMkI7QUFBQSxFQUNsRCxTQUFTLGFBQUUsT0FBTztBQUFBLElBQ2hCLE9BQU8sYUFBRSxPQUFPO0FBQUEsSUFDaEIsU0FBUyxhQUFFLE9BQU87QUFBQSxJQUNsQixVQUFVLGFBQUUsT0FBTztBQUFBLEVBQ3JCLENBQUMsRUFBRSxTQUFTLEVBQUUsU0FBUyw2QkFBNkI7QUFBQSxFQUNwRCxZQUFZLGFBQUUsUUFBUSxFQUFFLFNBQVMsa0NBQWtDO0FBQUEsRUFDbkUsVUFBVSxhQUFFLFFBQVEsRUFBRSxTQUFTLG1DQUFtQztBQUFBLEVBQ2xFLE9BQU8sYUFBRSxRQUFRLEVBQUUsU0FBUyxrQ0FBa0M7QUFBQSxFQUM5RCxTQUFTLGFBQUUsUUFBUSxFQUFFLFNBQVMsK0NBQStDO0FBQUEsRUFDN0UsWUFBWSxhQUFFLFFBQVEsRUFBRSxTQUFTLHFDQUFxQztBQUFBLEVBQ3RFLGFBQWEsYUFBRSxRQUFRLEVBQUUsU0FBUyxpQ0FBaUM7QUFBQSxFQUNuRSxZQUFZLGFBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxTQUFTLHFDQUFxQztBQUFBLEVBQ2pGLFNBQVMsYUFBRSxPQUFPLEVBQUUsU0FBUyw2Q0FBNkM7QUFBQSxFQUMxRSxTQUFTLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLGdDQUFnQztBQUFBLEVBQ3hFLGFBQWEsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsaURBQWlEO0FBQUEsRUFDN0YsaUJBQWlCLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLDhCQUE4QjtBQUNoRixDQUFDO0FBQ0QsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsUUFBUSxDQUFDLGlCQUFpQixlQUFlLFdBQVcsV0FBVztBQUFBLEVBQy9ELE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBQ25FLFVBQU0sV0FBVyxNQUFNLE1BQU0sSUFBSTtBQUFBO0FBQUEsTUFFL0IsVUFBVTtBQUFBLE1BQ1YsUUFBUTtBQUFBLFFBQ04sU0FBUyxNQUFNO0FBQUEsUUFDZixxQkFBcUI7QUFBQSxNQUN2QjtBQUFBLE1BQ0EsU0FBUztBQUFBLElBQ1gsQ0FBQztBQUNELFFBQUksQ0FBQyxTQUFTLFFBQVEsU0FBUyxLQUFLLE9BQU8sT0FBTztBQUNoRCxZQUFNLElBQUksTUFBTSxZQUFZO0FBQUEsUUFDMUIsTUFBTTtBQUFBLFFBQ04sU0FBUyxTQUFTLE1BQU0sU0FBUztBQUFBLFFBQ2pDLFlBQVksTUFBTTtBQUFBLE1BQ3BCLENBQUM7QUFBQSxJQUNIO0FBQ0EsVUFBTSxVQUFVLFNBQVMsS0FBSztBQUM5QixXQUFPO0FBQUEsTUFDTCxJQUFJLFFBQVE7QUFBQSxNQUNaLE1BQU0sUUFBUSxRQUFRO0FBQUEsTUFDdEIsT0FBTyxRQUFRLFNBQVM7QUFBQSxNQUN4QixTQUFTLFFBQVEsV0FBVztBQUFBLE1BQzVCLFlBQVksUUFBUSxjQUFjO0FBQUEsTUFDbEMsVUFBVSxRQUFRLFlBQVk7QUFBQSxNQUM5QixPQUFPLFFBQVEsU0FBUztBQUFBLE1BQ3hCLFNBQVMsUUFBUSxXQUFXO0FBQUEsTUFDNUIsWUFBWSxRQUFRLGNBQWM7QUFBQSxNQUNsQyxhQUFhLFFBQVEsZUFBZTtBQUFBLE1BQ3BDLFlBQVksUUFBUSxjQUFjO0FBQUEsTUFDbEMsU0FBUyxRQUFRLFdBQVc7QUFBQSxNQUM1QixTQUFTLFFBQVEsV0FBVztBQUFBLE1BQzVCLGFBQWEsUUFBUSxlQUFlO0FBQUEsTUFDcEMsaUJBQWlCLFFBQVEsbUJBQW1CO0FBQUEsSUFDOUM7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLDJCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
