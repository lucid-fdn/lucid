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

// hubspot/actions/create-deal.ts
var create_deal_exports = {};
__export(create_deal_exports, {
  default: () => create_deal_default
});
module.exports = __toCommonJS(create_deal_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  dealname: z.string().min(1).describe("Deal name"),
  amount: z.string().optional().describe("Deal amount"),
  dealstage: z.string().optional().describe("Deal stage ID"),
  pipeline: z.string().optional().describe('Pipeline ID (default: "default")'),
  closedate: z.string().optional().describe("Expected close date (ISO 8601)"),
  hubspot_owner_id: z.string().optional().describe("Owner ID"),
  properties: z.record(z.string(), z.string()).optional().describe("Additional properties")
});
var outputSchema = z.object({
  id: z.string(),
  dealname: z.string().optional(),
  amount: z.string().optional(),
  dealstage: z.string().optional(),
  created_at: z.string().optional()
});
var action = {
  type: "action",
  description: "Create a new deal in HubSpot CRM",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/hubspot/deals",
    group: "Deals"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const properties = {
      dealname: input.dealname,
      ...input.amount ? {
        amount: input.amount
      } : {},
      ...input.dealstage ? {
        dealstage: input.dealstage
      } : {},
      ...input.pipeline ? {
        pipeline: input.pipeline
      } : {},
      ...input.closedate ? {
        closedate: input.closedate
      } : {},
      ...input.hubspot_owner_id ? {
        hubspot_owner_id: input.hubspot_owner_id
      } : {},
      ...input.properties || {}
    };
    const response = await nango.proxy({
      method: "POST",
      endpoint: "/crm/v3/objects/deals",
      data: {
        properties
      }
    });
    if (response.data?.status === "error") {
      throw new Error(`HubSpot error: ${response.data.message}`);
    }
    return {
      id: response.data.id,
      dealname: response.data.properties?.dealname,
      amount: response.data.properties?.amount,
      dealstage: response.data.properties?.dealstage,
      created_at: response.data.createdAt
    };
  }
};
var create_deal_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiaHVic3BvdC9hY3Rpb25zL2NyZWF0ZS1kZWFsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5pbXBvcnQgKiBhcyB6IGZyb20gJ3pvZCc7XG5jb25zdCBpbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgZGVhbG5hbWU6IHouc3RyaW5nKCkubWluKDEpLmRlc2NyaWJlKCdEZWFsIG5hbWUnKSxcbiAgYW1vdW50OiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0RlYWwgYW1vdW50JyksXG4gIGRlYWxzdGFnZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdEZWFsIHN0YWdlIElEJyksXG4gIHBpcGVsaW5lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BpcGVsaW5lIElEIChkZWZhdWx0OiBcImRlZmF1bHRcIiknKSxcbiAgY2xvc2VkYXRlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0V4cGVjdGVkIGNsb3NlIGRhdGUgKElTTyA4NjAxKScpLFxuICBodWJzcG90X293bmVyX2lkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ093bmVyIElEJyksXG4gIHByb3BlcnRpZXM6IHoucmVjb3JkKHouc3RyaW5nKCksIHouc3RyaW5nKCkpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0FkZGl0aW9uYWwgcHJvcGVydGllcycpXG59KTtcbmNvbnN0IG91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIGRlYWxuYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGFtb3VudDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBkZWFsc3RhZ2U6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgY3JlYXRlZF9hdDogei5zdHJpbmcoKS5vcHRpb25hbCgpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdDcmVhdGUgYSBuZXcgZGVhbCBpbiBIdWJTcG90IENSTScsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9odWJzcG90L2RlYWxzJyxcbiAgICBncm91cDogJ0RlYWxzJ1xuICB9LFxuICBpbnB1dDogaW5wdXRTY2hlbWEsXG4gIG91dHB1dDogb3V0cHV0U2NoZW1hLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KSA9PiB7XG4gICAgY29uc3QgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgIGRlYWxuYW1lOiBpbnB1dC5kZWFsbmFtZSxcbiAgICAgIC4uLihpbnB1dC5hbW91bnQgPyB7XG4gICAgICAgIGFtb3VudDogaW5wdXQuYW1vdW50XG4gICAgICB9IDoge30pLFxuICAgICAgLi4uKGlucHV0LmRlYWxzdGFnZSA/IHtcbiAgICAgICAgZGVhbHN0YWdlOiBpbnB1dC5kZWFsc3RhZ2VcbiAgICAgIH0gOiB7fSksXG4gICAgICAuLi4oaW5wdXQucGlwZWxpbmUgPyB7XG4gICAgICAgIHBpcGVsaW5lOiBpbnB1dC5waXBlbGluZVxuICAgICAgfSA6IHt9KSxcbiAgICAgIC4uLihpbnB1dC5jbG9zZWRhdGUgPyB7XG4gICAgICAgIGNsb3NlZGF0ZTogaW5wdXQuY2xvc2VkYXRlXG4gICAgICB9IDoge30pLFxuICAgICAgLi4uKGlucHV0Lmh1YnNwb3Rfb3duZXJfaWQgPyB7XG4gICAgICAgIGh1YnNwb3Rfb3duZXJfaWQ6IGlucHV0Lmh1YnNwb3Rfb3duZXJfaWRcbiAgICAgIH0gOiB7fSksXG4gICAgICAuLi4oaW5wdXQucHJvcGVydGllcyB8fCB7fSlcbiAgICB9O1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucHJveHkoe1xuICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICBlbmRwb2ludDogJy9jcm0vdjMvb2JqZWN0cy9kZWFscycsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHByb3BlcnRpZXNcbiAgICAgIH1cbiAgICB9KTtcbiAgICBpZiAocmVzcG9uc2UuZGF0YT8uc3RhdHVzID09PSAnZXJyb3InKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEh1YlNwb3QgZXJyb3I6ICR7cmVzcG9uc2UuZGF0YS5tZXNzYWdlfWApO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IHJlc3BvbnNlLmRhdGEuaWQsXG4gICAgICBkZWFsbmFtZTogcmVzcG9uc2UuZGF0YS5wcm9wZXJ0aWVzPy5kZWFsbmFtZSxcbiAgICAgIGFtb3VudDogcmVzcG9uc2UuZGF0YS5wcm9wZXJ0aWVzPy5hbW91bnQsXG4gICAgICBkZWFsc3RhZ2U6IHJlc3BvbnNlLmRhdGEucHJvcGVydGllcz8uZGVhbHN0YWdlLFxuICAgICAgY3JlYXRlZF9hdDogcmVzcG9uc2UuZGF0YS5jcmVhdGVkQXRcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQSxRQUFtQjtBQUNuQixJQUFNLGNBQWdCLFNBQU87QUFBQSxFQUMzQixVQUFZLFNBQU8sRUFBRSxJQUFJLENBQUMsRUFBRSxTQUFTLFdBQVc7QUFBQSxFQUNoRCxRQUFVLFNBQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyxhQUFhO0FBQUEsRUFDcEQsV0FBYSxTQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsZUFBZTtBQUFBLEVBQ3pELFVBQVksU0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLGtDQUFrQztBQUFBLEVBQzNFLFdBQWEsU0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLGdDQUFnQztBQUFBLEVBQzFFLGtCQUFvQixTQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsVUFBVTtBQUFBLEVBQzNELFlBQWMsU0FBUyxTQUFPLEdBQUssU0FBTyxDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMsdUJBQXVCO0FBQzFGLENBQUM7QUFDRCxJQUFNLGVBQWlCLFNBQU87QUFBQSxFQUM1QixJQUFNLFNBQU87QUFBQSxFQUNiLFVBQVksU0FBTyxFQUFFLFNBQVM7QUFBQSxFQUM5QixRQUFVLFNBQU8sRUFBRSxTQUFTO0FBQUEsRUFDNUIsV0FBYSxTQUFPLEVBQUUsU0FBUztBQUFBLEVBQy9CLFlBQWMsU0FBTyxFQUFFLFNBQVM7QUFDbEMsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLE1BQU0sT0FBTyxPQUFPLFVBQVU7QUFDNUIsVUFBTSxhQUFxQztBQUFBLE1BQ3pDLFVBQVUsTUFBTTtBQUFBLE1BQ2hCLEdBQUksTUFBTSxTQUFTO0FBQUEsUUFDakIsUUFBUSxNQUFNO0FBQUEsTUFDaEIsSUFBSSxDQUFDO0FBQUEsTUFDTCxHQUFJLE1BQU0sWUFBWTtBQUFBLFFBQ3BCLFdBQVcsTUFBTTtBQUFBLE1BQ25CLElBQUksQ0FBQztBQUFBLE1BQ0wsR0FBSSxNQUFNLFdBQVc7QUFBQSxRQUNuQixVQUFVLE1BQU07QUFBQSxNQUNsQixJQUFJLENBQUM7QUFBQSxNQUNMLEdBQUksTUFBTSxZQUFZO0FBQUEsUUFDcEIsV0FBVyxNQUFNO0FBQUEsTUFDbkIsSUFBSSxDQUFDO0FBQUEsTUFDTCxHQUFJLE1BQU0sbUJBQW1CO0FBQUEsUUFDM0Isa0JBQWtCLE1BQU07QUFBQSxNQUMxQixJQUFJLENBQUM7QUFBQSxNQUNMLEdBQUksTUFBTSxjQUFjLENBQUM7QUFBQSxJQUMzQjtBQUNBLFVBQU0sV0FBVyxNQUFNLE1BQU0sTUFBTTtBQUFBLE1BQ2pDLFFBQVE7QUFBQSxNQUNSLFVBQVU7QUFBQSxNQUNWLE1BQU07QUFBQSxRQUNKO0FBQUEsTUFDRjtBQUFBLElBQ0YsQ0FBQztBQUNELFFBQUksU0FBUyxNQUFNLFdBQVcsU0FBUztBQUNyQyxZQUFNLElBQUksTUFBTSxrQkFBa0IsU0FBUyxLQUFLLE9BQU8sRUFBRTtBQUFBLElBQzNEO0FBQ0EsV0FBTztBQUFBLE1BQ0wsSUFBSSxTQUFTLEtBQUs7QUFBQSxNQUNsQixVQUFVLFNBQVMsS0FBSyxZQUFZO0FBQUEsTUFDcEMsUUFBUSxTQUFTLEtBQUssWUFBWTtBQUFBLE1BQ2xDLFdBQVcsU0FBUyxLQUFLLFlBQVk7QUFBQSxNQUNyQyxZQUFZLFNBQVMsS0FBSztBQUFBLElBQzVCO0FBQUEsRUFDRjtBQUNGO0FBQ0EsSUFBTyxzQkFBUTsiLAogICJuYW1lcyI6IFtdCn0K
