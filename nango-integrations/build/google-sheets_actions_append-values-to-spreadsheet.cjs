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

// google-sheets/actions/append-values-to-spreadsheet.ts
var append_values_to_spreadsheet_exports = {};
__export(append_values_to_spreadsheet_exports, {
  default: () => append_values_to_spreadsheet_default
});
module.exports = __toCommonJS(append_values_to_spreadsheet_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string().describe('The ID of the spreadsheet to update. Example: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"'),
  range: import_zod.z.string().describe('The A1 notation of a range to search for a logical table of data. Example: "Sheet1!A1" or "Sheet1"'),
  values: import_zod.z.array(import_zod.z.any()).describe("The values to append to the spreadsheet. Each inner array represents a row of data."),
  valueInputOption: import_zod.z.string().optional().describe('How the input data should be interpreted. "RAW": The values will be parsed as if the user typed them into the UI. "USER_ENTERED": The values will be parsed as if the user typed them into the UI, but formulas will be calculated.'),
  insertDataOption: import_zod.z.string().optional().describe('How the input data should be inserted. "OVERWRITE": Overwrite existing data. "INSERT_ROWS": Insert new rows.'),
  majorDimension: import_zod.z.string().optional().describe('The major dimension of the values. "ROWS": Values are organized by row. "COLUMNS": Values are organized by column.')
});
var OutputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string(),
  tableRange: import_zod.z.string(),
  updatedRange: import_zod.z.string(),
  updatedRows: import_zod.z.number(),
  updatedColumns: import_zod.z.number(),
  updatedCells: import_zod.z.number()
});
var action = {
  type: "action",
  description: "Append values to the end of a spreadsheet table",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/append-values-to-spreadsheet",
    group: "Sheets"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  exec: async (nango, input) => {
    const valueInputOption = input.valueInputOption ?? "USER_ENTERED";
    const insertDataOption = input.insertDataOption ?? "INSERT_ROWS";
    const majorDimension = input.majorDimension ?? "ROWS";
    const response = await nango.post({
      // https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/append
      endpoint: `/v4/spreadsheets/${input.spreadsheetId}/values/${encodeURIComponent(input.range)}:append`,
      params: {
        valueInputOption,
        insertDataOption,
        includeValuesInResponse: "true"
      },
      data: {
        values: input.values,
        majorDimension
      },
      retries: 3
    });
    const updates = response.data?.updates;
    if (!updates) {
      throw new nango.ActionError({
        type: "invalid_response",
        message: "Invalid response from Google Sheets API: missing updates data"
      });
    }
    return {
      spreadsheetId: response.data.spreadsheetId || input.spreadsheetId,
      tableRange: response.data.tableRange || "",
      updatedRange: updates.updatedRange || "",
      updatedRows: updates.updatedRows || 0,
      updatedColumns: updates.updatedColumns || 0,
      updatedCells: updates.updatedCells || 0
    };
  }
};
var append_values_to_spreadsheet_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLXNoZWV0cy9hY3Rpb25zL2FwcGVuZC12YWx1ZXMtdG8tc3ByZWFkc2hlZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNwcmVhZHNoZWV0SWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgc3ByZWFkc2hlZXQgdG8gdXBkYXRlLiBFeGFtcGxlOiBcIjFCeGlNVnMwWFJBNW5GTWRLdkJkQlpqZ21VVXFwdGxiczc0T2d2RTJ1cG1zXCInKSxcbiAgcmFuZ2U6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBBMSBub3RhdGlvbiBvZiBhIHJhbmdlIHRvIHNlYXJjaCBmb3IgYSBsb2dpY2FsIHRhYmxlIG9mIGRhdGEuIEV4YW1wbGU6IFwiU2hlZXQxIUExXCIgb3IgXCJTaGVldDFcIicpLFxuICB2YWx1ZXM6IHouYXJyYXkoei5hbnkoKSkuZGVzY3JpYmUoJ1RoZSB2YWx1ZXMgdG8gYXBwZW5kIHRvIHRoZSBzcHJlYWRzaGVldC4gRWFjaCBpbm5lciBhcnJheSByZXByZXNlbnRzIGEgcm93IG9mIGRhdGEuJyksXG4gIHZhbHVlSW5wdXRPcHRpb246IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnSG93IHRoZSBpbnB1dCBkYXRhIHNob3VsZCBiZSBpbnRlcnByZXRlZC4gXCJSQVdcIjogVGhlIHZhbHVlcyB3aWxsIGJlIHBhcnNlZCBhcyBpZiB0aGUgdXNlciB0eXBlZCB0aGVtIGludG8gdGhlIFVJLiBcIlVTRVJfRU5URVJFRFwiOiBUaGUgdmFsdWVzIHdpbGwgYmUgcGFyc2VkIGFzIGlmIHRoZSB1c2VyIHR5cGVkIHRoZW0gaW50byB0aGUgVUksIGJ1dCBmb3JtdWxhcyB3aWxsIGJlIGNhbGN1bGF0ZWQuJyksXG4gIGluc2VydERhdGFPcHRpb246IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnSG93IHRoZSBpbnB1dCBkYXRhIHNob3VsZCBiZSBpbnNlcnRlZC4gXCJPVkVSV1JJVEVcIjogT3ZlcndyaXRlIGV4aXN0aW5nIGRhdGEuIFwiSU5TRVJUX1JPV1NcIjogSW5zZXJ0IG5ldyByb3dzLicpLFxuICBtYWpvckRpbWVuc2lvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUaGUgbWFqb3IgZGltZW5zaW9uIG9mIHRoZSB2YWx1ZXMuIFwiUk9XU1wiOiBWYWx1ZXMgYXJlIG9yZ2FuaXplZCBieSByb3cuIFwiQ09MVU1OU1wiOiBWYWx1ZXMgYXJlIG9yZ2FuaXplZCBieSBjb2x1bW4uJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBzcHJlYWRzaGVldElkOiB6LnN0cmluZygpLFxuICB0YWJsZVJhbmdlOiB6LnN0cmluZygpLFxuICB1cGRhdGVkUmFuZ2U6IHouc3RyaW5nKCksXG4gIHVwZGF0ZWRSb3dzOiB6Lm51bWJlcigpLFxuICB1cGRhdGVkQ29sdW1uczogei5udW1iZXIoKSxcbiAgdXBkYXRlZENlbGxzOiB6Lm51bWJlcigpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdBcHBlbmQgdmFsdWVzIHRvIHRoZSBlbmQgb2YgYSBzcHJlYWRzaGVldCB0YWJsZScsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL2FwcGVuZC12YWx1ZXMtdG8tc3ByZWFkc2hlZXQnLFxuICAgIGdyb3VwOiAnU2hlZXRzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9zcHJlYWRzaGVldHMnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIGNvbnN0IHZhbHVlSW5wdXRPcHRpb24gPSBpbnB1dC52YWx1ZUlucHV0T3B0aW9uID8/ICdVU0VSX0VOVEVSRUQnO1xuICAgIGNvbnN0IGluc2VydERhdGFPcHRpb24gPSBpbnB1dC5pbnNlcnREYXRhT3B0aW9uID8/ICdJTlNFUlRfUk9XUyc7XG4gICAgY29uc3QgbWFqb3JEaW1lbnNpb24gPSBpbnB1dC5tYWpvckRpbWVuc2lvbiA/PyAnUk9XUyc7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wb3N0KHtcbiAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3NoZWV0cy9hcGkvcmVmZXJlbmNlL3Jlc3QvdjQvc3ByZWFkc2hlZXRzLnZhbHVlcy9hcHBlbmRcbiAgICAgIGVuZHBvaW50OiBgL3Y0L3NwcmVhZHNoZWV0cy8ke2lucHV0LnNwcmVhZHNoZWV0SWR9L3ZhbHVlcy8ke2VuY29kZVVSSUNvbXBvbmVudChpbnB1dC5yYW5nZSl9OmFwcGVuZGAsXG4gICAgICBwYXJhbXM6IHtcbiAgICAgICAgdmFsdWVJbnB1dE9wdGlvbjogdmFsdWVJbnB1dE9wdGlvbixcbiAgICAgICAgaW5zZXJ0RGF0YU9wdGlvbjogaW5zZXJ0RGF0YU9wdGlvbixcbiAgICAgICAgaW5jbHVkZVZhbHVlc0luUmVzcG9uc2U6ICd0cnVlJ1xuICAgICAgfSxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgdmFsdWVzOiBpbnB1dC52YWx1ZXMsXG4gICAgICAgIG1ham9yRGltZW5zaW9uOiBtYWpvckRpbWVuc2lvblxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBjb25zdCB1cGRhdGVzID0gcmVzcG9uc2UuZGF0YT8udXBkYXRlcztcbiAgICBpZiAoIXVwZGF0ZXMpIHtcbiAgICAgIHRocm93IG5ldyBuYW5nby5BY3Rpb25FcnJvcih7XG4gICAgICAgIHR5cGU6ICdpbnZhbGlkX3Jlc3BvbnNlJyxcbiAgICAgICAgbWVzc2FnZTogJ0ludmFsaWQgcmVzcG9uc2UgZnJvbSBHb29nbGUgU2hlZXRzIEFQSTogbWlzc2luZyB1cGRhdGVzIGRhdGEnXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIHNwcmVhZHNoZWV0SWQ6IHJlc3BvbnNlLmRhdGEuc3ByZWFkc2hlZXRJZCB8fCBpbnB1dC5zcHJlYWRzaGVldElkLFxuICAgICAgdGFibGVSYW5nZTogcmVzcG9uc2UuZGF0YS50YWJsZVJhbmdlIHx8ICcnLFxuICAgICAgdXBkYXRlZFJhbmdlOiB1cGRhdGVzLnVwZGF0ZWRSYW5nZSB8fCAnJyxcbiAgICAgIHVwZGF0ZWRSb3dzOiB1cGRhdGVzLnVwZGF0ZWRSb3dzIHx8IDAsXG4gICAgICB1cGRhdGVkQ29sdW1uczogdXBkYXRlcy51cGRhdGVkQ29sdW1ucyB8fCAwLFxuICAgICAgdXBkYXRlZENlbGxzOiB1cGRhdGVzLnVwZGF0ZWRDZWxscyB8fCAwXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLGVBQWUsYUFBRSxPQUFPLEVBQUUsU0FBUyw4RkFBOEY7QUFBQSxFQUNqSSxPQUFPLGFBQUUsT0FBTyxFQUFFLFNBQVMsb0dBQW9HO0FBQUEsRUFDL0gsUUFBUSxhQUFFLE1BQU0sYUFBRSxJQUFJLENBQUMsRUFBRSxTQUFTLHFGQUFxRjtBQUFBLEVBQ3ZILGtCQUFrQixhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyxxT0FBcU87QUFBQSxFQUN0UixrQkFBa0IsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsOEdBQThHO0FBQUEsRUFDL0osZ0JBQWdCLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLG9IQUFvSDtBQUNySyxDQUFDO0FBQ0QsSUFBTSxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQzVCLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDeEIsWUFBWSxhQUFFLE9BQU87QUFBQSxFQUNyQixjQUFjLGFBQUUsT0FBTztBQUFBLEVBQ3ZCLGFBQWEsYUFBRSxPQUFPO0FBQUEsRUFDdEIsZ0JBQWdCLGFBQUUsT0FBTztBQUFBLEVBQ3pCLGNBQWMsYUFBRSxPQUFPO0FBQ3pCLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUMsOENBQThDO0FBQUEsRUFDdkQsTUFBTSxPQUFPLE9BQU8sVUFBaUQ7QUFDbkUsVUFBTSxtQkFBbUIsTUFBTSxvQkFBb0I7QUFDbkQsVUFBTSxtQkFBbUIsTUFBTSxvQkFBb0I7QUFDbkQsVUFBTSxpQkFBaUIsTUFBTSxrQkFBa0I7QUFDL0MsVUFBTSxXQUFXLE1BQU0sTUFBTSxLQUFLO0FBQUE7QUFBQSxNQUVoQyxVQUFVLG9CQUFvQixNQUFNLGFBQWEsV0FBVyxtQkFBbUIsTUFBTSxLQUFLLENBQUM7QUFBQSxNQUMzRixRQUFRO0FBQUEsUUFDTjtBQUFBLFFBQ0E7QUFBQSxRQUNBLHlCQUF5QjtBQUFBLE1BQzNCO0FBQUEsTUFDQSxNQUFNO0FBQUEsUUFDSixRQUFRLE1BQU07QUFBQSxRQUNkO0FBQUEsTUFDRjtBQUFBLE1BQ0EsU0FBUztBQUFBLElBQ1gsQ0FBQztBQUNELFVBQU0sVUFBVSxTQUFTLE1BQU07QUFDL0IsUUFBSSxDQUFDLFNBQVM7QUFDWixZQUFNLElBQUksTUFBTSxZQUFZO0FBQUEsUUFDMUIsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLE1BQ1gsQ0FBQztBQUFBLElBQ0g7QUFDQSxXQUFPO0FBQUEsTUFDTCxlQUFlLFNBQVMsS0FBSyxpQkFBaUIsTUFBTTtBQUFBLE1BQ3BELFlBQVksU0FBUyxLQUFLLGNBQWM7QUFBQSxNQUN4QyxjQUFjLFFBQVEsZ0JBQWdCO0FBQUEsTUFDdEMsYUFBYSxRQUFRLGVBQWU7QUFBQSxNQUNwQyxnQkFBZ0IsUUFBUSxrQkFBa0I7QUFBQSxNQUMxQyxjQUFjLFFBQVEsZ0JBQWdCO0FBQUEsSUFDeEM7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLHVDQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
