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

// hubspot/actions/search-deals.ts
var search_deals_exports = {};
__export(search_deals_exports, {
  default: () => search_deals_default
});
module.exports = __toCommonJS(search_deals_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  query: z.string().optional().describe("Search query for deals"),
  limit: z.number().min(1).max(100).optional().describe("Max results (1-100, default 10)"),
  properties: z.array(z.string()).optional().describe("Properties to return")
});
var dealSchema = z.object({
  id: z.string(),
  dealname: z.string().optional(),
  amount: z.string().optional(),
  dealstage: z.string().optional(),
  pipeline: z.string().optional(),
  closedate: z.string().optional(),
  createdate: z.string().optional(),
  hubspot_owner_id: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional()
});
var outputSchema = z.object({
  deals: z.array(dealSchema),
  total: z.number()
});
var action = {
  type: "action",
  description: "Search deals in HubSpot CRM",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/hubspot/deals/search",
    group: "Deals"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const props = input.properties || ["dealname", "amount", "dealstage", "pipeline", "closedate", "createdate", "hubspot_owner_id"];
    const body = {
      limit: input.limit ?? 10,
      properties: props
    };
    if (input.query) body["query"] = input.query;
    const response = await nango.proxy({
      method: "POST",
      endpoint: "/crm/v3/objects/deals/search",
      data: body
    });
    if (response.data?.status === "error") {
      throw new Error(`HubSpot error: ${response.data.message}`);
    }
    const deals = (response.data?.results || []).map((d) => ({
      id: d.id,
      dealname: d.properties?.dealname,
      amount: d.properties?.amount,
      dealstage: d.properties?.dealstage,
      pipeline: d.properties?.pipeline,
      closedate: d.properties?.closedate,
      createdate: d.properties?.createdate,
      hubspot_owner_id: d.properties?.hubspot_owner_id,
      properties: d.properties
    }));
    return {
      deals,
      total: response.data?.total || deals.length
    };
  }
};
var search_deals_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiaHVic3BvdC9hY3Rpb25zL3NlYXJjaC1kZWFscy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuaW1wb3J0ICogYXMgeiBmcm9tICd6b2QnO1xuY29uc3QgaW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHF1ZXJ5OiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1NlYXJjaCBxdWVyeSBmb3IgZGVhbHMnKSxcbiAgbGltaXQ6IHoubnVtYmVyKCkubWluKDEpLm1heCgxMDApLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ01heCByZXN1bHRzICgxLTEwMCwgZGVmYXVsdCAxMCknKSxcbiAgcHJvcGVydGllczogei5hcnJheSh6LnN0cmluZygpKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQcm9wZXJ0aWVzIHRvIHJldHVybicpXG59KTtcbmNvbnN0IGRlYWxTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICBkZWFsbmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBhbW91bnQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgZGVhbHN0YWdlOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHBpcGVsaW5lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGNsb3NlZGF0ZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBjcmVhdGVkYXRlOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGh1YnNwb3Rfb3duZXJfaWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgcHJvcGVydGllczogei5yZWNvcmQoei5zdHJpbmcoKSwgei51bmtub3duKCkpLm9wdGlvbmFsKClcbn0pO1xuY29uc3Qgb3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBkZWFsczogei5hcnJheShkZWFsU2NoZW1hKSxcbiAgdG90YWw6IHoubnVtYmVyKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ1NlYXJjaCBkZWFscyBpbiBIdWJTcG90IENSTScsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9odWJzcG90L2RlYWxzL3NlYXJjaCcsXG4gICAgZ3JvdXA6ICdEZWFscydcbiAgfSxcbiAgaW5wdXQ6IGlucHV0U2NoZW1hLFxuICBvdXRwdXQ6IG91dHB1dFNjaGVtYSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCkgPT4ge1xuICAgIGNvbnN0IHByb3BzID0gaW5wdXQucHJvcGVydGllcyB8fCBbJ2RlYWxuYW1lJywgJ2Ftb3VudCcsICdkZWFsc3RhZ2UnLCAncGlwZWxpbmUnLCAnY2xvc2VkYXRlJywgJ2NyZWF0ZWRhdGUnLCAnaHVic3BvdF9vd25lcl9pZCddO1xuICAgIGNvbnN0IGJvZHk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge1xuICAgICAgbGltaXQ6IGlucHV0LmxpbWl0ID8/IDEwLFxuICAgICAgcHJvcGVydGllczogcHJvcHNcbiAgICB9O1xuICAgIGlmIChpbnB1dC5xdWVyeSkgYm9keVsncXVlcnknXSA9IGlucHV0LnF1ZXJ5O1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucHJveHkoe1xuICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICBlbmRwb2ludDogJy9jcm0vdjMvb2JqZWN0cy9kZWFscy9zZWFyY2gnLFxuICAgICAgZGF0YTogYm9keVxuICAgIH0pO1xuICAgIGlmIChyZXNwb25zZS5kYXRhPy5zdGF0dXMgPT09ICdlcnJvcicpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgSHViU3BvdCBlcnJvcjogJHtyZXNwb25zZS5kYXRhLm1lc3NhZ2V9YCk7XG4gICAgfVxuXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICBjb25zdCBkZWFscyA9IChyZXNwb25zZS5kYXRhPy5yZXN1bHRzIHx8IFtdKS5tYXAoKGQ6IGFueSkgPT4gKHtcbiAgICAgIGlkOiBkLmlkLFxuICAgICAgZGVhbG5hbWU6IGQucHJvcGVydGllcz8uZGVhbG5hbWUsXG4gICAgICBhbW91bnQ6IGQucHJvcGVydGllcz8uYW1vdW50LFxuICAgICAgZGVhbHN0YWdlOiBkLnByb3BlcnRpZXM/LmRlYWxzdGFnZSxcbiAgICAgIHBpcGVsaW5lOiBkLnByb3BlcnRpZXM/LnBpcGVsaW5lLFxuICAgICAgY2xvc2VkYXRlOiBkLnByb3BlcnRpZXM/LmNsb3NlZGF0ZSxcbiAgICAgIGNyZWF0ZWRhdGU6IGQucHJvcGVydGllcz8uY3JlYXRlZGF0ZSxcbiAgICAgIGh1YnNwb3Rfb3duZXJfaWQ6IGQucHJvcGVydGllcz8uaHVic3BvdF9vd25lcl9pZCxcbiAgICAgIHByb3BlcnRpZXM6IGQucHJvcGVydGllc1xuICAgIH0pKTtcbiAgICByZXR1cm4ge1xuICAgICAgZGVhbHMsXG4gICAgICB0b3RhbDogcmVzcG9uc2UuZGF0YT8udG90YWwgfHwgZGVhbHMubGVuZ3RoXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ0EsUUFBbUI7QUFDbkIsSUFBTSxjQUFnQixTQUFPO0FBQUEsRUFDM0IsT0FBUyxTQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsd0JBQXdCO0FBQUEsRUFDOUQsT0FBUyxTQUFPLEVBQUUsSUFBSSxDQUFDLEVBQUUsSUFBSSxHQUFHLEVBQUUsU0FBUyxFQUFFLFNBQVMsaUNBQWlDO0FBQUEsRUFDdkYsWUFBYyxRQUFRLFNBQU8sQ0FBQyxFQUFFLFNBQVMsRUFBRSxTQUFTLHNCQUFzQjtBQUM1RSxDQUFDO0FBQ0QsSUFBTSxhQUFlLFNBQU87QUFBQSxFQUMxQixJQUFNLFNBQU87QUFBQSxFQUNiLFVBQVksU0FBTyxFQUFFLFNBQVM7QUFBQSxFQUM5QixRQUFVLFNBQU8sRUFBRSxTQUFTO0FBQUEsRUFDNUIsV0FBYSxTQUFPLEVBQUUsU0FBUztBQUFBLEVBQy9CLFVBQVksU0FBTyxFQUFFLFNBQVM7QUFBQSxFQUM5QixXQUFhLFNBQU8sRUFBRSxTQUFTO0FBQUEsRUFDL0IsWUFBYyxTQUFPLEVBQUUsU0FBUztBQUFBLEVBQ2hDLGtCQUFvQixTQUFPLEVBQUUsU0FBUztBQUFBLEVBQ3RDLFlBQWMsU0FBUyxTQUFPLEdBQUssVUFBUSxDQUFDLEVBQUUsU0FBUztBQUN6RCxDQUFDO0FBQ0QsSUFBTSxlQUFpQixTQUFPO0FBQUEsRUFDNUIsT0FBUyxRQUFNLFVBQVU7QUFBQSxFQUN6QixPQUFTLFNBQU87QUFDbEIsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLE1BQU0sT0FBTyxPQUFPLFVBQVU7QUFDNUIsVUFBTSxRQUFRLE1BQU0sY0FBYyxDQUFDLFlBQVksVUFBVSxhQUFhLFlBQVksYUFBYSxjQUFjLGtCQUFrQjtBQUMvSCxVQUFNLE9BQWdDO0FBQUEsTUFDcEMsT0FBTyxNQUFNLFNBQVM7QUFBQSxNQUN0QixZQUFZO0FBQUEsSUFDZDtBQUNBLFFBQUksTUFBTSxNQUFPLE1BQUssT0FBTyxJQUFJLE1BQU07QUFDdkMsVUFBTSxXQUFXLE1BQU0sTUFBTSxNQUFNO0FBQUEsTUFDakMsUUFBUTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLElBQ1IsQ0FBQztBQUNELFFBQUksU0FBUyxNQUFNLFdBQVcsU0FBUztBQUNyQyxZQUFNLElBQUksTUFBTSxrQkFBa0IsU0FBUyxLQUFLLE9BQU8sRUFBRTtBQUFBLElBQzNEO0FBR0EsVUFBTSxTQUFTLFNBQVMsTUFBTSxXQUFXLENBQUMsR0FBRyxJQUFJLENBQUMsT0FBWTtBQUFBLE1BQzVELElBQUksRUFBRTtBQUFBLE1BQ04sVUFBVSxFQUFFLFlBQVk7QUFBQSxNQUN4QixRQUFRLEVBQUUsWUFBWTtBQUFBLE1BQ3RCLFdBQVcsRUFBRSxZQUFZO0FBQUEsTUFDekIsVUFBVSxFQUFFLFlBQVk7QUFBQSxNQUN4QixXQUFXLEVBQUUsWUFBWTtBQUFBLE1BQ3pCLFlBQVksRUFBRSxZQUFZO0FBQUEsTUFDMUIsa0JBQWtCLEVBQUUsWUFBWTtBQUFBLE1BQ2hDLFlBQVksRUFBRTtBQUFBLElBQ2hCLEVBQUU7QUFDRixXQUFPO0FBQUEsTUFDTDtBQUFBLE1BQ0EsT0FBTyxTQUFTLE1BQU0sU0FBUyxNQUFNO0FBQUEsSUFDdkM7QUFBQSxFQUNGO0FBQ0Y7QUFDQSxJQUFPLHVCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
