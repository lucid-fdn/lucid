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

// slack/actions/create-conversation.ts
var create_conversation_exports = {};
__export(create_conversation_exports, {
  default: () => create_conversation_default
});
module.exports = __toCommonJS(create_conversation_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  name: import_zod.z.string().describe("Name of the channel to create. Must be lowercase, contain only letters, numbers, hyphens, and underscores, and be 80 characters or less."),
  is_private: import_zod.z.boolean().optional().describe("Whether the channel should be private. Defaults to false (public channel).")
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("The unique identifier of the channel."),
  name: import_zod.z.string().describe("The normalized name of the channel."),
  is_private: import_zod.z.boolean().describe("Whether the channel is private."),
  is_channel: import_zod.z.boolean().describe("Whether this is a channel."),
  created: import_zod.z.number().describe("Unix timestamp when the channel was created."),
  creator: import_zod.z.string().describe("User ID of the channel creator.")
});
var action = {
  type: "action",
  description: "Create a new public or private Slack channel by name; does not create DMs or other conversation types.",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/create-conversation",
    group: "Conversations"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:manage", "channels:write", "groups:write"],
  exec: async (nango, input) => {
    const response = await nango.post({
      endpoint: "conversations.create",
      data: {
        name: input.name,
        is_private: input.is_private ?? false
      },
      retries: 3
    });
    if (!response.data || !response.data.ok) {
      const error = response.data?.error || "Unknown error";
      throw new nango.ActionError({
        type: "api_error",
        message: `Failed to create conversation: ${error}`,
        error
      });
    }
    const channel = response.data.channel;
    return {
      id: channel.id,
      name: channel.name,
      is_private: channel.is_private,
      is_channel: channel.is_channel,
      created: channel.created,
      creator: channel.creator
    };
  }
};
var create_conversation_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9jcmVhdGUtY29udmVyc2F0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBuYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdOYW1lIG9mIHRoZSBjaGFubmVsIHRvIGNyZWF0ZS4gTXVzdCBiZSBsb3dlcmNhc2UsIGNvbnRhaW4gb25seSBsZXR0ZXJzLCBudW1iZXJzLCBoeXBoZW5zLCBhbmQgdW5kZXJzY29yZXMsIGFuZCBiZSA4MCBjaGFyYWN0ZXJzIG9yIGxlc3MuJyksXG4gIGlzX3ByaXZhdGU6IHouYm9vbGVhbigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1doZXRoZXIgdGhlIGNoYW5uZWwgc2hvdWxkIGJlIHByaXZhdGUuIERlZmF1bHRzIHRvIGZhbHNlIChwdWJsaWMgY2hhbm5lbCkuJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIHVuaXF1ZSBpZGVudGlmaWVyIG9mIHRoZSBjaGFubmVsLicpLFxuICBuYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgbm9ybWFsaXplZCBuYW1lIG9mIHRoZSBjaGFubmVsLicpLFxuICBpc19wcml2YXRlOiB6LmJvb2xlYW4oKS5kZXNjcmliZSgnV2hldGhlciB0aGUgY2hhbm5lbCBpcyBwcml2YXRlLicpLFxuICBpc19jaGFubmVsOiB6LmJvb2xlYW4oKS5kZXNjcmliZSgnV2hldGhlciB0aGlzIGlzIGEgY2hhbm5lbC4nKSxcbiAgY3JlYXRlZDogei5udW1iZXIoKS5kZXNjcmliZSgnVW5peCB0aW1lc3RhbXAgd2hlbiB0aGUgY2hhbm5lbCB3YXMgY3JlYXRlZC4nKSxcbiAgY3JlYXRvcjogei5zdHJpbmcoKS5kZXNjcmliZSgnVXNlciBJRCBvZiB0aGUgY2hhbm5lbCBjcmVhdG9yLicpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdDcmVhdGUgYSBuZXcgcHVibGljIG9yIHByaXZhdGUgU2xhY2sgY2hhbm5lbCBieSBuYW1lOyBkb2VzIG5vdCBjcmVhdGUgRE1zIG9yIG90aGVyIGNvbnZlcnNhdGlvbiB0eXBlcy4nLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9jcmVhdGUtY29udmVyc2F0aW9uJyxcbiAgICBncm91cDogJ0NvbnZlcnNhdGlvbnMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydjaGFubmVsczptYW5hZ2UnLCAnY2hhbm5lbHM6d3JpdGUnLCAnZ3JvdXBzOndyaXRlJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICAvLyBodHRwczovL2FwaS5zbGFjay5jb20vbWV0aG9kcy9jb252ZXJzYXRpb25zLmNyZWF0ZVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucG9zdCh7XG4gICAgICBlbmRwb2ludDogJ2NvbnZlcnNhdGlvbnMuY3JlYXRlJyxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgbmFtZTogaW5wdXQubmFtZSxcbiAgICAgICAgaXNfcHJpdmF0ZTogaW5wdXQuaXNfcHJpdmF0ZSA/PyBmYWxzZVxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBpZiAoIXJlc3BvbnNlLmRhdGEgfHwgIXJlc3BvbnNlLmRhdGEub2spIHtcbiAgICAgIGNvbnN0IGVycm9yID0gcmVzcG9uc2UuZGF0YT8uZXJyb3IgfHwgJ1Vua25vd24gZXJyb3InO1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ2FwaV9lcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6IGBGYWlsZWQgdG8gY3JlYXRlIGNvbnZlcnNhdGlvbjogJHtlcnJvcn1gLFxuICAgICAgICBlcnJvcjogZXJyb3JcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBjaGFubmVsID0gcmVzcG9uc2UuZGF0YS5jaGFubmVsO1xuICAgIHJldHVybiB7XG4gICAgICBpZDogY2hhbm5lbC5pZCxcbiAgICAgIG5hbWU6IGNoYW5uZWwubmFtZSxcbiAgICAgIGlzX3ByaXZhdGU6IGNoYW5uZWwuaXNfcHJpdmF0ZSxcbiAgICAgIGlzX2NoYW5uZWw6IGNoYW5uZWwuaXNfY2hhbm5lbCxcbiAgICAgIGNyZWF0ZWQ6IGNoYW5uZWwuY3JlYXRlZCxcbiAgICAgIGNyZWF0b3I6IGNoYW5uZWwuY3JlYXRvclxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixNQUFNLGFBQUUsT0FBTyxFQUFFLFNBQVMsMElBQTBJO0FBQUEsRUFDcEssWUFBWSxhQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsU0FBUyw0RUFBNEU7QUFDMUgsQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixJQUFJLGFBQUUsT0FBTyxFQUFFLFNBQVMsdUNBQXVDO0FBQUEsRUFDL0QsTUFBTSxhQUFFLE9BQU8sRUFBRSxTQUFTLHFDQUFxQztBQUFBLEVBQy9ELFlBQVksYUFBRSxRQUFRLEVBQUUsU0FBUyxpQ0FBaUM7QUFBQSxFQUNsRSxZQUFZLGFBQUUsUUFBUSxFQUFFLFNBQVMsNEJBQTRCO0FBQUEsRUFDN0QsU0FBUyxhQUFFLE9BQU8sRUFBRSxTQUFTLDhDQUE4QztBQUFBLEVBQzNFLFNBQVMsYUFBRSxPQUFPLEVBQUUsU0FBUyxpQ0FBaUM7QUFDaEUsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyxtQkFBbUIsa0JBQWtCLGNBQWM7QUFBQSxFQUM1RCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUVuRSxVQUFNLFdBQVcsTUFBTSxNQUFNLEtBQUs7QUFBQSxNQUNoQyxVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsUUFDSixNQUFNLE1BQU07QUFBQSxRQUNaLFlBQVksTUFBTSxjQUFjO0FBQUEsTUFDbEM7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxRQUFJLENBQUMsU0FBUyxRQUFRLENBQUMsU0FBUyxLQUFLLElBQUk7QUFDdkMsWUFBTSxRQUFRLFNBQVMsTUFBTSxTQUFTO0FBQ3RDLFlBQU0sSUFBSSxNQUFNLFlBQVk7QUFBQSxRQUMxQixNQUFNO0FBQUEsUUFDTixTQUFTLGtDQUFrQyxLQUFLO0FBQUEsUUFDaEQ7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNIO0FBQ0EsVUFBTSxVQUFVLFNBQVMsS0FBSztBQUM5QixXQUFPO0FBQUEsTUFDTCxJQUFJLFFBQVE7QUFBQSxNQUNaLE1BQU0sUUFBUTtBQUFBLE1BQ2QsWUFBWSxRQUFRO0FBQUEsTUFDcEIsWUFBWSxRQUFRO0FBQUEsTUFDcEIsU0FBUyxRQUFRO0FBQUEsTUFDakIsU0FBUyxRQUFRO0FBQUEsSUFDbkI7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLDhCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
