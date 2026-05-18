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

// google/actions/batch-get-values.ts
var batch_get_values_exports = {};
__export(batch_get_values_exports, {
  default: () => batch_get_values_default
});
module.exports = __toCommonJS(batch_get_values_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string().describe('The ID of the spreadsheet to retrieve data from. Example: "1abc123xyz"'),
  ranges: import_zod.z.array(import_zod.z.string()).describe('The A1 notation or R1C1 notation of the ranges to retrieve values from. Example: ["Sheet1!A1:D5", "Sheet2!B2:C4"]'),
  majorDimension: import_zod.z.enum(["ROWS", "COLUMNS"]).optional().describe("The major dimension that results should use. Defaults to ROWS."),
  valueRenderOption: import_zod.z.enum(["FORMATTED_VALUE", "UNFORMATTED_VALUE", "FORMULA"]).optional().describe("How values should be rendered in the output."),
  dateTimeRenderOption: import_zod.z.enum(["SERIAL_NUMBER", "FORMATTED_STRING"]).optional().describe("How dates, times, and durations should be represented in the output.")
});
var ValueRangeSchema = import_zod.z.object({
  range: import_zod.z.string().describe("The range the values cover, in A1 notation."),
  majorDimension: import_zod.z.string().optional().describe("The major dimension of the values."),
  values: import_zod.z.array(import_zod.z.array(import_zod.z.any())).optional().describe("The data that was read. Array of arrays representing rows/columns, with each cell value being a string, number, boolean, or null.")
});
var OutputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string().describe("The ID of the spreadsheet the data was retrieved from."),
  valueRanges: import_zod.z.array(ValueRangeSchema).describe("The values of the ranges requested.")
});
var action = {
  type: "action",
  description: "Get values from multiple ranges",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/actions/batch-get-values",
    group: "Spreadsheets"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  exec: async (nango, input) => {
    const params = {};
    if (input.ranges && input.ranges.length > 0) {
      params["ranges"] = input.ranges;
    }
    if (input.majorDimension) {
      params["majorDimension"] = input.majorDimension;
    }
    if (input.valueRenderOption) {
      params["valueRenderOption"] = input.valueRenderOption;
    }
    if (input.dateTimeRenderOption) {
      params["dateTimeRenderOption"] = input.dateTimeRenderOption;
    }
    const response = await nango.get({
      baseUrlOverride: "https://sheets.googleapis.com",
      endpoint: `/v4/spreadsheets/${input.spreadsheetId}/values:batchGet`,
      params,
      retries: 3
    });
    if (!response.data) {
      throw new nango.ActionError({
        type: "not_found",
        message: "No data found for the specified ranges",
        spreadsheetId: input.spreadsheetId,
        ranges: input.ranges
      });
    }
    const valueRanges = response.data.valueRanges || [];
    return {
      spreadsheetId: response.data.spreadsheetId,
      valueRanges: valueRanges.map((range) => ({
        range: range.range,
        majorDimension: range.majorDimension,
        values: range.values
      }))
    };
  }
};
var batch_get_values_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvYmF0Y2gtZ2V0LXZhbHVlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3ByZWFkc2hlZXRJZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIElEIG9mIHRoZSBzcHJlYWRzaGVldCB0byByZXRyaWV2ZSBkYXRhIGZyb20uIEV4YW1wbGU6IFwiMWFiYzEyM3h5elwiJyksXG4gIHJhbmdlczogei5hcnJheSh6LnN0cmluZygpKS5kZXNjcmliZSgnVGhlIEExIG5vdGF0aW9uIG9yIFIxQzEgbm90YXRpb24gb2YgdGhlIHJhbmdlcyB0byByZXRyaWV2ZSB2YWx1ZXMgZnJvbS4gRXhhbXBsZTogW1wiU2hlZXQxIUExOkQ1XCIsIFwiU2hlZXQyIUIyOkM0XCJdJyksXG4gIG1ham9yRGltZW5zaW9uOiB6LmVudW0oWydST1dTJywgJ0NPTFVNTlMnXSkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGhlIG1ham9yIGRpbWVuc2lvbiB0aGF0IHJlc3VsdHMgc2hvdWxkIHVzZS4gRGVmYXVsdHMgdG8gUk9XUy4nKSxcbiAgdmFsdWVSZW5kZXJPcHRpb246IHouZW51bShbJ0ZPUk1BVFRFRF9WQUxVRScsICdVTkZPUk1BVFRFRF9WQUxVRScsICdGT1JNVUxBJ10pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0hvdyB2YWx1ZXMgc2hvdWxkIGJlIHJlbmRlcmVkIGluIHRoZSBvdXRwdXQuJyksXG4gIGRhdGVUaW1lUmVuZGVyT3B0aW9uOiB6LmVudW0oWydTRVJJQUxfTlVNQkVSJywgJ0ZPUk1BVFRFRF9TVFJJTkcnXSkub3B0aW9uYWwoKS5kZXNjcmliZSgnSG93IGRhdGVzLCB0aW1lcywgYW5kIGR1cmF0aW9ucyBzaG91bGQgYmUgcmVwcmVzZW50ZWQgaW4gdGhlIG91dHB1dC4nKVxufSk7XG5jb25zdCBWYWx1ZVJhbmdlU2NoZW1hID0gei5vYmplY3Qoe1xuICByYW5nZTogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIHJhbmdlIHRoZSB2YWx1ZXMgY292ZXIsIGluIEExIG5vdGF0aW9uLicpLFxuICBtYWpvckRpbWVuc2lvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUaGUgbWFqb3IgZGltZW5zaW9uIG9mIHRoZSB2YWx1ZXMuJyksXG4gIHZhbHVlczogei5hcnJheSh6LmFycmF5KHouYW55KCkpKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUaGUgZGF0YSB0aGF0IHdhcyByZWFkLiBBcnJheSBvZiBhcnJheXMgcmVwcmVzZW50aW5nIHJvd3MvY29sdW1ucywgd2l0aCBlYWNoIGNlbGwgdmFsdWUgYmVpbmcgYSBzdHJpbmcsIG51bWJlciwgYm9vbGVhbiwgb3IgbnVsbC4nKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNwcmVhZHNoZWV0SWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgc3ByZWFkc2hlZXQgdGhlIGRhdGEgd2FzIHJldHJpZXZlZCBmcm9tLicpLFxuICB2YWx1ZVJhbmdlczogei5hcnJheShWYWx1ZVJhbmdlU2NoZW1hKS5kZXNjcmliZSgnVGhlIHZhbHVlcyBvZiB0aGUgcmFuZ2VzIHJlcXVlc3RlZC4nKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnR2V0IHZhbHVlcyBmcm9tIG11bHRpcGxlIHJhbmdlcycsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnR0VUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvYmF0Y2gtZ2V0LXZhbHVlcycsXG4gICAgZ3JvdXA6ICdTcHJlYWRzaGVldHMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9hdXRoL3NwcmVhZHNoZWV0cy5yZWFkb25seSddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgY29uc3QgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBzdHJpbmdbXT4gPSB7fTtcbiAgICBpZiAoaW5wdXQucmFuZ2VzICYmIGlucHV0LnJhbmdlcy5sZW5ndGggPiAwKSB7XG4gICAgICBwYXJhbXNbJ3JhbmdlcyddID0gaW5wdXQucmFuZ2VzO1xuICAgIH1cbiAgICBpZiAoaW5wdXQubWFqb3JEaW1lbnNpb24pIHtcbiAgICAgIHBhcmFtc1snbWFqb3JEaW1lbnNpb24nXSA9IGlucHV0Lm1ham9yRGltZW5zaW9uO1xuICAgIH1cbiAgICBpZiAoaW5wdXQudmFsdWVSZW5kZXJPcHRpb24pIHtcbiAgICAgIHBhcmFtc1sndmFsdWVSZW5kZXJPcHRpb24nXSA9IGlucHV0LnZhbHVlUmVuZGVyT3B0aW9uO1xuICAgIH1cbiAgICBpZiAoaW5wdXQuZGF0ZVRpbWVSZW5kZXJPcHRpb24pIHtcbiAgICAgIHBhcmFtc1snZGF0ZVRpbWVSZW5kZXJPcHRpb24nXSA9IGlucHV0LmRhdGVUaW1lUmVuZGVyT3B0aW9uO1xuICAgIH1cblxuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3NoZWV0cy9hcGkvcmVmZXJlbmNlL3Jlc3QvdjQvc3ByZWFkc2hlZXRzLnZhbHVlcy9iYXRjaEdldFxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0KHtcbiAgICAgIGVuZHBvaW50OiBgL3Y0L3NwcmVhZHNoZWV0cy8ke2lucHV0LnNwcmVhZHNoZWV0SWR9L3ZhbHVlczpiYXRjaEdldGAsXG4gICAgICBwYXJhbXMsXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgaWYgKCFyZXNwb25zZS5kYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgbmFuZ28uQWN0aW9uRXJyb3Ioe1xuICAgICAgICB0eXBlOiAnbm90X2ZvdW5kJyxcbiAgICAgICAgbWVzc2FnZTogJ05vIGRhdGEgZm91bmQgZm9yIHRoZSBzcGVjaWZpZWQgcmFuZ2VzJyxcbiAgICAgICAgc3ByZWFkc2hlZXRJZDogaW5wdXQuc3ByZWFkc2hlZXRJZCxcbiAgICAgICAgcmFuZ2VzOiBpbnB1dC5yYW5nZXNcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCB2YWx1ZVJhbmdlcyA9IHJlc3BvbnNlLmRhdGEudmFsdWVSYW5nZXMgfHwgW107XG4gICAgcmV0dXJuIHtcbiAgICAgIHNwcmVhZHNoZWV0SWQ6IHJlc3BvbnNlLmRhdGEuc3ByZWFkc2hlZXRJZCxcbiAgICAgIHZhbHVlUmFuZ2VzOiB2YWx1ZVJhbmdlcy5tYXAoKHJhbmdlOiB7XG4gICAgICAgIHJhbmdlOiBzdHJpbmc7XG4gICAgICAgIG1ham9yRGltZW5zaW9uPzogc3RyaW5nO1xuICAgICAgICB2YWx1ZXM/OiB1bmtub3duW11bXTtcbiAgICAgIH0pID0+ICh7XG4gICAgICAgIHJhbmdlOiByYW5nZS5yYW5nZSxcbiAgICAgICAgbWFqb3JEaW1lbnNpb246IHJhbmdlLm1ham9yRGltZW5zaW9uLFxuICAgICAgICB2YWx1ZXM6IHJhbmdlLnZhbHVlc1xuICAgICAgfSkpXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLGVBQWUsYUFBRSxPQUFPLEVBQUUsU0FBUyx3RUFBd0U7QUFBQSxFQUMzRyxRQUFRLGFBQUUsTUFB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
