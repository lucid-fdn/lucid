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

// slack/actions/set-channel-purpose.ts
var set_channel_purpose_exports = {};
__export(set_channel_purpose_exports, {
  default: () => set_channel_purpose_default
});
module.exports = __toCommonJS(set_channel_purpose_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe('Channel ID to set the purpose for. Example: "C1234567890"'),
  purpose: import_zod.z.string().describe("The new purpose text for the channel.")
});
var OutputSchema = import_zod.z.object({
  success: import_zod.z.boolean().describe("Whether the purpose was successfully updated"),
  channel_id: import_zod.z.string().describe("The ID of the channel that was updated"),
  purpose: import_zod.z.string().describe("The new purpose that was set")
});
var action = {
  type: "action",
  description: "Update a channel's purpose text for a conversation",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/set-channel-purpose",
    group: "Channels"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["chat:write", "channels:write", "groups:write", "im:write", "mpim:write"],
  exec: async (nango, input) => {
    const response = await nango.post({
      endpoint: "conversations.setPurpose",
      data: {
        channel: input.channel_id,
        purpose: input.purpose
      },
      retries: 3
    });
    if (!response.data?.ok) {
      throw new nango.ActionError({
        type: "api_error",
        message: response.data?.error || "Failed to set channel purpose",
        channel_id: input.channel_id
      });
    }
    return {
      success: true,
      channel_id: input.channel_id,
      purpose: input.purpose
    };
  }
};
var set_channel_purpose_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9zZXQtY2hhbm5lbC1wdXJwb3NlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBjaGFubmVsX2lkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDaGFubmVsIElEIHRvIHNldCB0aGUgcHVycG9zZSBmb3IuIEV4YW1wbGU6IFwiQzEyMzQ1Njc4OTBcIicpLFxuICBwdXJwb3NlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgbmV3IHB1cnBvc2UgdGV4dCBmb3IgdGhlIGNoYW5uZWwuJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBzdWNjZXNzOiB6LmJvb2xlYW4oKS5kZXNjcmliZSgnV2hldGhlciB0aGUgcHVycG9zZSB3YXMgc3VjY2Vzc2Z1bGx5IHVwZGF0ZWQnKSxcbiAgY2hhbm5lbF9pZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIElEIG9mIHRoZSBjaGFubmVsIHRoYXQgd2FzIHVwZGF0ZWQnKSxcbiAgcHVycG9zZTogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIG5ldyBwdXJwb3NlIHRoYXQgd2FzIHNldCcpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246IFwiVXBkYXRlIGEgY2hhbm5lbCdzIHB1cnBvc2UgdGV4dCBmb3IgYSBjb252ZXJzYXRpb25cIixcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvc2V0LWNoYW5uZWwtcHVycG9zZScsXG4gICAgZ3JvdXA6ICdDaGFubmVscydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2NoYXQ6d3JpdGUnLCAnY2hhbm5lbHM6d3JpdGUnLCAnZ3JvdXBzOndyaXRlJywgJ2ltOndyaXRlJywgJ21waW06d3JpdGUnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIC8vIGh0dHBzOi8vZG9jcy5zbGFjay5kZXYvcmVmZXJlbmNlL21ldGhvZHMvY29udmVyc2F0aW9ucy5zZXRQdXJwb3NlL1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucG9zdCh7XG4gICAgICBlbmRwb2ludDogJ2NvbnZlcnNhdGlvbnMuc2V0UHVycG9zZScsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIGNoYW5uZWw6IGlucHV0LmNoYW5uZWxfaWQsXG4gICAgICAgIHB1cnBvc2U6IGlucHV0LnB1cnBvc2VcbiAgICAgIH0sXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgaWYgKCFyZXNwb25zZS5kYXRhPy5vaykge1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ2FwaV9lcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6IHJlc3BvbnNlLmRhdGE/LmVycm9yIHx8ICdGYWlsZWQgdG8gc2V0IGNoYW5uZWwgcHVycG9zZScsXG4gICAgICAgIGNoYW5uZWxfaWQ6IGlucHV0LmNoYW5uZWxfaWRcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIGNoYW5uZWxfaWQ6IGlucHV0LmNoYW5uZWxfaWQsXG4gICAgICBwdXJwb3NlOiBpbnB1dC5wdXJwb3NlXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLFlBQVksYUFBRSxPQUFPLEVBQUUsU0FBUywyREFBMkQ7QUFBQSxFQUMzRixTQUFTLGFBQUUsT0FBTyxFQUFFLFNBQVMsdUNBQXVDO0FBQ3RFLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsU0FBUyxhQUFFLFFBQVEsRUFBRSxTQUFTLDhDQUE4QztBQUFBLEVBQzVFLFlBQVksYUFBRSxPQUFPLEVBQUUsU0FBUyx3Q0FBd0M7QUFBQSxFQUN4RSxTQUFTLGFBQUUsT0FBTyxFQUFFLFNBQVMsOEJBQThCO0FBQzdELENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUMsY0FBYyxrQkFBa0IsZ0JBQWdCLFlBQVksWUFBWTtBQUFBLEVBQ2pGLE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBRW5FLFVBQU0sV0FBVyxNQUFNLE1BQU0sS0FBSztBQUFBLE1BQ2hDLFVBQVU7QUFBQSxNQUNWLE1BQU07QUFBQSxRQUNKLFNBQVMsTUFBTTtBQUFBLFFBQ2YsU0FBUyxNQUFNO0FBQUEsTUFDakI7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxRQUFJLENBQUMsU0FBUyxNQUFNLElBQUk7QUFDdEIsWUFBTSxJQUFJLE1BQU0sWUFBWTtBQUFBLFFBQzFCLE1BQU07QUFBQSxRQUNOLFNBQVMsU0FBUyxNQUFNLFNBQVM7QUFBQSxRQUNqQyxZQUFZLE1BQU07QUFBQSxNQUNwQixDQUFDO0FBQUEsSUFDSDtBQUNBLFdBQU87QUFBQSxNQUNMLFNBQVM7QUFBQSxNQUNULFlBQVksTUFBTTtBQUFBLE1BQ2xCLFNBQVMsTUFBTTtBQUFBLElBQ2pCO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyw4QkFBUTsiLAogICJuYW1lcyI6IFtdCn0K
