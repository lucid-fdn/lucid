"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// slack/actions/list-channels.ts
var list_channels_exports = {};
__export(list_channels_exports, {
  default: () => list_channels_default
});
module.exports = __toCommonJS(list_channels_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  limit: z.number().min(1).max(200).optional().describe("Max channels to return (1-200, default 100)"),
  types: z.string().optional().describe("Comma-separated channel types: public_channel, private_channel (default: public_channel)")
});
var channelSchema = z.object({
  id: z.string(),
  name: z.string(),
  topic: z.string().optional(),
  purpose: z.string().optional(),
  num_members: z.number().optional(),
  is_private: z.boolean().optional(),
  is_archived: z.boolean().optional()
});
var outputSchema = z.object({
  channels: z.array(channelSchema),
  total: z.number()
});
var action = {
  type: "action",
  description: "List Slack channels the bot has access to",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/slack/channels",
    group: "Channels"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "GET",
      endpoint: "/api/conversations.list",
      params: {
        limit: String(input.limit ?? 100),
        types: input.types ?? "public_channel",
        exclude_archived: "true"
      }
    });
    if (!response.data?.ok) {
      throw new Error(`Slack API error: ${response.data?.error || "Unknown error"}`);
    }
    const channels = (response.data.channels || []).map((c) => ({
      id: c.id,
      name: c.name,
      topic: c.topic?.value || void 0,
      purpose: c.purpose?.value || void 0,
      num_members: c.num_members,
      is_private: c.is_private,
      is_archived: c.is_archived
    }));
    return {
      channels,
      total: channels.length
    };
  }
};
var list_channels_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9saXN0LWNoYW5uZWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5pbXBvcnQgKiBhcyB6IGZyb20gJ3pvZCc7XG5jb25zdCBpbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgbGltaXQ6IHoubnVtYmVyKCkubWluKDEpLm1heCgyMDApLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ01heCBjaGFubmVscyB0byByZXR1cm4gKDEtMjAwLCBkZWZhdWx0IDEwMCknKSxcbiAgdHlwZXM6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ29tbWEtc2VwYXJhdGVkIGNoYW5uZWwgdHlwZXM6IHB1YmxpY19jaGFubmVsLCBwcml2YXRlX2NoYW5uZWwgKGRlZmF1bHQ6IHB1YmxpY19jaGFubmVsKScpXG59KTtcbmNvbnN0IGNoYW5uZWxTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICBuYW1lOiB6LnN0cmluZygpLFxuICB0b3BpYzogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBwdXJwb3NlOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIG51bV9tZW1iZXJzOiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gIGlzX3ByaXZhdGU6IHouYm9vbGVhbigpLm9wdGlvbmFsKCksXG4gIGlzX2FyY2hpdmVkOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpXG59KTtcbmNvbnN0IG91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgY2hhbm5lbHM6IHouYXJyYXkoY2hhbm5lbFNjaGVtYSksXG4gIHRvdGFsOiB6Lm51bWJlcigpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdMaXN0IFNsYWNrIGNoYW5uZWxzIHRoZSBib3QgaGFzIGFjY2VzcyB0bycsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnR0VUJyxcbiAgICBwYXRoOiAnL3NsYWNrL2NoYW5uZWxzJyxcbiAgICBncm91cDogJ0NoYW5uZWxzJ1xuICB9LFxuICBpbnB1dDogaW5wdXRTY2hlbWEsXG4gIG91dHB1dDogb3V0cHV0U2NoZW1hLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KSA9PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wcm94eSh7XG4gICAgICBtZXRob2Q6ICdHRVQnLFxuICAgICAgZW5kcG9pbnQ6ICcvYXBpL2NvbnZlcnNhdGlvbnMubGlzdCcsXG4gICAgICBwYXJhbXM6IHtcbiAgICAgICAgbGltaXQ6IFN0cmluZyhpbnB1dC5saW1pdCA/PyAxMDApLFxuICAgICAgICB0eXBlczogaW5wdXQudHlwZXMgPz8gJ3B1YmxpY19jaGFubmVsJyxcbiAgICAgICAgZXhjbHVkZV9hcmNoaXZlZDogJ3RydWUnXG4gICAgICB9XG4gICAgfSk7XG4gICAgaWYgKCFyZXNwb25zZS5kYXRhPy5vaykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBTbGFjayBBUEkgZXJyb3I6ICR7cmVzcG9uc2UuZGF0YT8uZXJyb3IgfHwgJ1Vua25vd24gZXJyb3InfWApO1xuICAgIH1cblxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgY29uc3QgY2hhbm5lbHMgPSAocmVzcG9uc2UuZGF0YS5jaGFubmVscyB8fCBbXSkubWFwKChjOiBhbnkpID0+ICh7XG4gICAgICBpZDogYy5pZCxcbiAgICAgIG5hbWU6IGMubmFtZSxcbiAgICAgIHRvcGljOiBjLnRvcGljPy52YWx1ZSB8fCB1bmRlZmluZWQsXG4gICAgICBwdXJwb3NlOiBjLnB1cnBvc2U/LnZhbHVlIHx8IHVuZGVmaW5lZCxcbiAgICAgIG51bV9tZW1iZXJzOiBjLm51bV9tZW1iZXJzLFxuICAgICAgaXNfcHJpdmF0ZTogYy5pc19wcml2YXRlLFxuICAgICAgaXNfYXJjaGl2ZWQ6IGMuaXNfYXJjaGl2ZWRcbiAgICB9KSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGNoYW5uZWxzLFxuICAgICAgdG90YWw6IGNoYW5uZWxzLmxlbmd0aFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUNBLFFBQW1CO0FBQ25CLElBQU0sY0FBZ0IsU0FBTztBQUFBLEVBQzNCLE9BQVMsU0FBTyxFQUFFLElBQUksQ0FBQyxFQUFFLElBQUksR0FBRyxFQUFFLFNBQVMsRUFBRSxTQUFTLDZDQUE2QztBQUFBLEVBQ25HLE9BQVMsU0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLDBGQUEwRjtBQUNsSSxDQUFDO0FBQ0QsSUFBTSxnQkFBa0IsU0FBTztBQUFBLEVBQzdCLElBQU0sU0FBTztBQUFBLEVBQ2IsTUFBUSxTQUFPO0FBQUEsRUFDZixPQUFTLFNBQU8sRUFBRSxTQUFTO0FBQUEsRUFDM0IsU0FBVyxTQUFPLEVBQUUsU0FBUztBQUFBLEVBQzdCLGFBQWUsU0FBTyxFQUFFLFNBQVM7QUFBQSxFQUNqQyxZQUFjLFVBQVEsRUFBRSxTQUFTO0FBQUEsRUFDakMsYUFBZSxVQUFRLEVBQUUsU0FBUztBQUNwQyxDQUFDO0FBQ0QsSUFBTSxlQUFpQixTQUFPO0FBQUEsRUFDNUIsVUFBWSxRQUFNLGFBQWE7QUFBQSxFQUMvQixPQUFTLFNBQU87QUFDbEIsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLE1BQU0sT0FBTyxPQUFPLFVBQVU7QUFDNUIsVUFBTSxXQUFXLE1BQU0sTUFBTSxNQUFNO0FBQUEsTUFDakMsUUFBUTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsUUFBUTtBQUFBLFFBQ04sT0FBTyxPQUFPLE1BQU0sU0FBUyxHQUFHO0FBQUEsUUFDaEMsT0FBTyxNQUFNLFNBQVM7QUFBQSxRQUN0QixrQkFBa0I7QUFBQSxNQUNwQjtBQUFBLElBQ0YsQ0FBQztBQUNELFFBQUksQ0FBQyxTQUFTLE1BQU0sSUFBSTtBQUN0QixZQUFNLElBQUksTUFBTSxvQkFBb0IsU0FBUyxNQUFNLFNBQVMsZUFBZSxFQUFFO0FBQUEsSUFDL0U7QUFHQSxVQUFNLFlBQVksU0FBUyxLQUFLLFlBQVksQ0FBQyxHQUFHLElBQUksQ0FBQyxPQUFZO0FBQUEsTUFDL0QsSUFBSSxFQUFFO0FBQUEsTUFDTixNQUFNLEVBQUU7QUFBQSxNQUNSLE9BQU8sRUFBRSxPQUFPLFNBQVM7QUFBQSxNQUN6QixTQUFTLEVBQUUsU0FBUyxTQUFTO0FBQUEsTUFDN0IsYUFBYSxFQUFFO0FBQUEsTUFDZixZQUFZLEVBQUU7QUFBQSxNQUNkLGFBQWEsRUFBRTtBQUFBLElBQ2pCLEVBQUU7QUFDRixXQUFPO0FBQUEsTUFDTDtBQUFBLE1BQ0EsT0FBTyxTQUFTO0FBQUEsSUFDbEI7QUFBQSxFQUNGO0FBQ0Y7QUFDQSxJQUFPLHdCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
