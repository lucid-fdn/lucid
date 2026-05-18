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

// google/actions/clear-values.ts
var clear_values_exports = {};
__export(clear_values_exports, {
  default: () => clear_values_default
});
module.exports = __toCommonJS(clear_values_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string().describe('The ID of the spreadsheet to update. Example: "1a2b3c4d5e6f7g8h9i0j"'),
  range: import_zod.z.string().describe('The A1 notation or R1C1 notation of the values to clear. Example: "Sheet1!A1:D10"')
});
var OutputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string(),
  clearedRange: import_zod.z.string()
});
var action = {
  type: "action",
  description: "Clear values from a range, preserving formatting",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/clear-values",
    group: "Values"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  exec: async (nango, input) => {
    const response = await nango.post({
      baseUrlOverride: "https://sheets.googleapis.com",
      endpoint: `v4/spreadsheets/${input.spreadsheetId}/values/${encodeURIComponent(input.range)}:clear`,
      data: {},
      retries: 3
    });
    return {
      spreadsheetId: response.data.spreadsheetId,
      clearedRange: response.data.clearedRange
    };
  }
};
var clear_values_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvY2xlYXItdmFsdWVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBzcHJlYWRzaGVldElkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgSUQgb2YgdGhlIHNwcmVhZHNoZWV0IHRvIHVwZGF0ZS4gRXhhbXBsZTogXCIxYTJiM2M0ZDVlNmY3ZzhoOWkwalwiJyksXG4gIHJhbmdlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgQTEgbm90YXRpb24gb3IgUjFDMSBub3RhdGlvbiBvZiB0aGUgdmFsdWVzIHRvIGNsZWFyLiBFeGFtcGxlOiBcIlNoZWV0MSFBMTpEMTBcIicpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3ByZWFkc2hlZXRJZDogei5zdHJpbmcoKSxcbiAgY2xlYXJlZFJhbmdlOiB6LnN0cmluZygpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdDbGVhciB2YWx1ZXMgZnJvbSBhIHJhbmdlLCBwcmVzZXJ2aW5nIGZvcm1hdHRpbmcnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9jbGVhci12YWx1ZXMnLFxuICAgIGdyb3VwOiAnVmFsdWVzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9zcHJlYWRzaGVldHMnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3NoZWV0cy9hcGkvcmVmZXJlbmNlL3Jlc3QvdjQvc3ByZWFkc2hlZXRzLnZhbHVlcy9jbGVhclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucG9zdCh7XG4gICAgICBlbmRwb2ludDogYHY0L3NwcmVhZHNoZWV0cy8ke2lucHV0LnNwcmVhZHNoZWV0SWR9L3ZhbHVlcy8ke2VuY29kZVVSSUNvbXBvbmVudChpbnB1dC5yYW5nZSl9OmNsZWFyYCxcbiAgICAgIGRhdGE6IHt9LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIHJldHVybiB7XG4gICAgICBzcHJlYWRzaGVldElkOiByZXNwb25zZS5kYXRhLnNwcmVhZHNoZWV0SWQsXG4gICAgICBjbGVhcmVkUmFuZ2U6IHJlc3BvbnNlLmRhdGEuY2xlYXJlZFJhbmdlXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLGVBQWUsYUFBRSxPQUFPLEVBQUUsU0FBUyxzRUFBc0U7QUFBQSxFQUN6RyxPQUFPLGFBQUUsT0FBTyxFQUFFLFNBQVMsbUZBQW1GO0FBQ2hILENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsZUFBZSxhQUFFLE9BQU87QUFBQSxFQUN4QixjQUFjLGFBQUUsT0FBTztBQUN6QixDQUFDO0FBQ0QsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsUUFBUSxDQUFDLDhDQUE4QztBQUFBLEVBQ3ZELE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBRW5FLFVBQU0sV0FBVyxNQUFNLE1BQU0sS0FBSztBQUFBLE1BQ2hDLFVBQVUsbUJBQW1CLE1BQU0sYUFBYSxXQUFXLG1CQUFtQixNQUFNLEtBQUssQ0FBQztBQUFBLE1BQzFGLE1BQU0sQ0FBQztBQUFBLE1BQ1AsU0FBUztBQUFBLElBQ1gsQ0FBQztBQUNELFdBQU87QUFBQSxNQUNMLGVBQWUsU0FBUyxLQUFLO0FBQUEsTUFDN0IsY0FBYyxTQUFTLEtBQUs7QUFBQSxJQUM5QjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sdUJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
